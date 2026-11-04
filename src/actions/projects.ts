"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { safeAction, UserError } from "@/lib/action";
import { AccessError, LEVEL, canCreateProjects, requireProject, wsContextById } from "@/lib/access";
import { logActivity, notify } from "@/lib/events";
import { PROJECT_STATUS_LABEL } from "@/lib/labels";

const uuid = z.string().uuid();
const optUuid = z.preprocess((v) => (v ? v : null), uuid.nullable());
const optDate = z.preprocess((v) => (v ? v : null), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida").nullable());

const projectFields = z.object({
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres").max(120),
  description: z.string().max(5000).default(""),
  objectives: z.string().max(5000).default(""),
  category: z.string().trim().max(60).default(""),
  teamId: optUuid,
  ownerId: optUuid,
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  status: z.enum(["active", "on_hold", "completed", "archived"]).default("active"),
  visibility: z.enum(["workspace", "private"]).default("workspace"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#3b66f0"),
  startDate: optDate,
  endDate: optDate,
});

function parseProject(fd: FormData) {
  const get = (k: string) => fd.get(k) ?? undefined;
  const p = projectFields.parse({
    name: get("name"), description: get("description"), objectives: get("objectives"), category: get("category"),
    teamId: get("teamId"), ownerId: get("ownerId"), priority: get("priority"), status: get("status"),
    visibility: get("visibility"), color: get("color"), startDate: get("startDate"), endDate: get("endDate"),
  });
  if (p.startDate && p.endDate && p.endDate < p.startDate) throw new UserError("La fecha de finalización no puede ser anterior al inicio");
  return p;
}

async function assertMembers(wsId: string, ids: (string | null)[]) {
  const list = ids.filter(Boolean) as string[];
  if (!list.length) return;
  const r = await sql`select user_id from workspace_members where workspace_id = ${wsId} and user_id in ${sql(list)}`;
  if (r.length !== new Set(list).size) throw new UserError("El usuario seleccionado no pertenece al espacio");
}
async function assertTeam(wsId: string, teamId: string | null) {
  if (!teamId) return;
  const r = await sql`select 1 from teams where id = ${teamId} and workspace_id = ${wsId}`;
  if (!r.length) throw new UserError("Equipo no válido");
}

export const createProject = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  if (!canCreateProjects(ctx.role)) throw new AccessError("Los invitados no pueden crear proyectos");
  const p = parseProject(fd);
  const owner = p.ownerId ?? ctx.user.id;
  await assertMembers(ctx.ws.id, [owner]);
  await assertTeam(ctx.ws.id, p.teamId);
  const [row] = await sql<{ id: string }[]>`insert into projects
    (workspace_id, team_id, name, description, objectives, category, color, owner_id, status, priority, visibility, start_date, end_date, created_by)
    values (${ctx.ws.id}, ${p.teamId}, ${p.name}, ${p.description}, ${p.objectives}, ${p.category}, ${p.color}, ${owner}, ${p.status},
            ${p.priority}, ${p.visibility}, ${p.startDate}, ${p.endDate}, ${ctx.user.id}) returning id`;
  // El creador siempre conserva acceso de administración al proyecto
  await sql`insert into project_members (project_id, user_id, role) values (${row.id}, ${ctx.user.id}, 'admin') on conflict do nothing`;
  await logActivity({ workspaceId: ctx.ws.id, projectId: row.id, actorId: ctx.user.id, entityType: "project", entityId: row.id, action: "project.created", summary: `creó el proyecto «${p.name}»` });
  await notify([owner], { workspaceId: ctx.ws.id, actorId: ctx.user.id, kind: "project", title: `${ctx.user.name} te nombró responsable de «${p.name}»`, link: `/w/${ctx.ws.slug}/projects/${row.id}` });
  redirect(`/w/${ctx.ws.slug}/projects/${row.id}`);
});

export const updateProject = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  const id = uuid.parse(fd.get("projectId"));
  const proj = await requireProject(ctx, id, LEVEL.edit);
  const p = parseProject(fd);
  await assertMembers(ctx.ws.id, [p.ownerId]);
  await assertTeam(ctx.ws.id, p.teamId);
  const [before] = await sql<{ owner_id: string | null; status: string; visibility: string }[]>`select owner_id, status, visibility from projects where id = ${id}`;
  // Cambiar visibilidad, responsable o equipo requiere administración del proyecto
  const sensitive = before.visibility !== p.visibility || (p.ownerId && before.owner_id !== p.ownerId);
  if (sensitive && proj.level < LEVEL.admin) throw new AccessError("Sólo los administradores del proyecto pueden cambiar responsable o visibilidad");
  await sql`update projects set name = ${p.name}, description = ${p.description}, objectives = ${p.objectives}, category = ${p.category},
    team_id = ${p.teamId}, owner_id = ${p.ownerId ?? before.owner_id}, priority = ${p.priority}, status = ${p.status}, visibility = ${p.visibility},
    color = ${p.color}, start_date = ${p.startDate}, end_date = ${p.endDate}, updated_at = now() where id = ${id}`;
  const summary = before.status !== p.status
    ? `cambió el estado de «${p.name}» a ${PROJECT_STATUS_LABEL[p.status]}`
    : `actualizó el proyecto «${p.name}»`;
  await logActivity({ workspaceId: ctx.ws.id, projectId: id, actorId: ctx.user.id, entityType: "project", entityId: id, action: "project.updated", summary });
  if (p.ownerId && p.ownerId !== before.owner_id)
    await notify([p.ownerId], { workspaceId: ctx.ws.id, actorId: ctx.user.id, kind: "project", title: `${ctx.user.name} te nombró responsable de «${p.name}»`, link: `/w/${ctx.ws.slug}/projects/${id}` });
  revalidatePath(`/w/${ctx.ws.slug}`, "layout");
  return { ok: true, message: "Proyecto guardado" };
});

export const deleteProject = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  const id = uuid.parse(fd.get("projectId"));
  const p = await requireProject(ctx, id, LEVEL.admin);
  await sql`delete from attachments where (entity_type = 'project' and entity_id = ${id})
    or (entity_type = 'task' and entity_id in (select id from tasks where project_id = ${id}))`;
  await sql`delete from comments where (entity_type = 'project' and entity_id = ${id})
    or (entity_type = 'task' and entity_id in (select id from tasks where project_id = ${id}))`;
  await sql`delete from share_links where entity_type = 'project' and entity_id = ${id}`;
  await sql`delete from projects where id = ${id}`;
  await logActivity({ workspaceId: ctx.ws.id, actorId: ctx.user.id, entityType: "project", entityId: id, action: "project.deleted", summary: `eliminó el proyecto «${p.name}»` });
  redirect(`/w/${ctx.ws.slug}/projects`);
});

export const setProjectMember = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  const id = uuid.parse(fd.get("projectId"));
  const p = await requireProject(ctx, id, LEVEL.admin);
  const userId = uuid.parse(fd.get("userId"));
  const role = z.enum(["viewer", "editor", "admin", "remove"]).parse(fd.get("role"));
  await assertMembers(ctx.ws.id, [userId]);
  const [u] = await sql<{ name: string }[]>`select name from users where id = ${userId}`;
  if (role === "remove") {
    await sql`delete from project_members where project_id = ${id} and user_id = ${userId}`;
    await logActivity({ workspaceId: ctx.ws.id, projectId: id, actorId: ctx.user.id, entityType: "project", entityId: id, action: "project.member_removed", summary: `quitó a ${u.name} del proyecto «${p.name}»` });
  } else {
    const r = await sql`insert into project_members (project_id, user_id, role) values (${id}, ${userId}, ${role})
      on conflict (project_id, user_id) do update set role = excluded.role returning (xmax = 0) as inserted`;
    await logActivity({ workspaceId: ctx.ws.id, projectId: id, actorId: ctx.user.id, entityType: "project", entityId: id, action: "project.member_set", summary: `dio acceso a ${u.name} en «${p.name}»` });
    if (r[0]?.inserted)
      await notify([userId], { workspaceId: ctx.ws.id, actorId: ctx.user.id, kind: "project", title: `${ctx.user.name} te agregó al proyecto «${p.name}»`, link: `/w/${ctx.ws.slug}/projects/${id}` });
  }
  revalidatePath(`/w/${ctx.ws.slug}/projects/${id}`);
});
