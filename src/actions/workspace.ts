"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { randomToken, sha256 } from "@/lib/crypto";
import { safeAction, UserError } from "@/lib/action";
import { AccessError, LEVEL, projectLevel, wsContextById } from "@/lib/access";
import { logActivity, notify } from "@/lib/events";
import { appUrl, sendMail } from "@/lib/mail";
import { ROLE_LABEL, type WorkspaceRole } from "@/lib/labels";

const uuid = z.string().uuid();
const role = z.enum(["admin", "leader", "member", "guest"]);

function slugify(s: string) {
  const base = s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "espacio";
  return `${base}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
}

export const createWorkspace = safeAction(async (fd) => {
  const user = await requireUser();
  const name = z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres").max(60).parse(fd.get("name"));
  const slug = slugify(name);
  const [ws] = await sql<{ id: string }[]>`insert into workspaces (name, slug, created_by) values (${name}, ${slug}, ${user.id}) returning id`;
  await sql`insert into workspace_members (workspace_id, user_id, role) values (${ws.id}, ${user.id}, 'admin')`;
  await logActivity({ workspaceId: ws.id, actorId: user.id, entityType: "workspace", entityId: ws.id, action: "workspace.created", summary: `creó el espacio «${name}»` });
  redirect(`/w/${slug}`);
});

export const updateWorkspace = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  if (ctx.role !== "admin") throw new AccessError();
  const name = z.string().trim().min(2).max(60).parse(fd.get("name"));
  await sql`update workspaces set name = ${name} where id = ${ctx.ws.id}`;
  await logActivity({ workspaceId: ctx.ws.id, actorId: ctx.user.id, entityType: "workspace", entityId: ctx.ws.id, action: "workspace.updated", summary: `renombró el espacio a «${name}»` });
  revalidatePath(`/w/${ctx.ws.slug}`, "layout");
  return { ok: true, message: "Guardado" };
});

export const inviteMember = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  const data = z.object({
    email: z.string().trim().toLowerCase().email("Correo no válido"),
    role,
    projectId: uuid.optional(),
    projectRole: z.enum(["viewer", "editor", "admin"]).optional(),
  }).parse({
    email: fd.get("email"), role: fd.get("role") ?? "member",
    projectId: fd.get("projectId") || undefined, projectRole: fd.get("projectRole") || undefined,
  });

  // Reglas de quién puede invitar
  if (data.projectId) {
    if ((await projectLevel(ctx.user.id, data.projectId)) < LEVEL.admin) throw new AccessError("Necesitas permiso de administración del proyecto para compartirlo");
    if (ctx.role !== "admin" && data.role !== "guest" && data.role !== "member") throw new AccessError();
  } else if (ctx.role === "leader") {
    if (!["member", "guest"].includes(data.role)) throw new AccessError("Los líderes sólo pueden invitar colaboradores o invitados");
  } else if (ctx.role !== "admin") {
    throw new AccessError("Sólo administradores y líderes pueden invitar al espacio");
  }

  // Si el usuario ya es miembro y es una compartición de proyecto, se agrega directamente
  const [existing] = await sql<{ id: string; role: WorkspaceRole }[]>`
    select u.id, wm.role from users u join workspace_members wm on wm.user_id = u.id and wm.workspace_id = ${ctx.ws.id}
    where lower(u.email) = ${data.email}`;
  if (existing) {
    if (!data.projectId) throw new UserError("Esa persona ya es miembro del espacio");
    await sql`insert into project_members (project_id, user_id, role) values (${data.projectId}, ${existing.id}, ${data.projectRole ?? "editor"})
      on conflict (project_id, user_id) do update set role = excluded.role`;
    const [p] = await sql<{ name: string }[]>`select name from projects where id = ${data.projectId}`;
    await notify([existing.id], { workspaceId: ctx.ws.id, actorId: ctx.user.id, kind: "share", title: `${ctx.user.name} compartió contigo el proyecto «${p.name}»`, link: `/w/${ctx.ws.slug}/projects/${data.projectId}` });
    await logActivity({ workspaceId: ctx.ws.id, projectId: data.projectId, actorId: ctx.user.id, entityType: "project", entityId: data.projectId, action: "project.shared", summary: `compartió «${p.name}» con ${data.email}` });
    revalidatePath(`/w/${ctx.ws.slug}`, "layout");
    return { ok: true, message: `${data.email} ya tiene acceso al proyecto.` };
  }

  const token = randomToken();
  await sql`insert into invitations (workspace_id, email, role, project_id, project_role, token_hash, invited_by, expires_at)
    values (${ctx.ws.id}, ${data.email}, ${data.projectId ? (data.role === "member" ? "member" : "guest") : data.role},
            ${data.projectId ?? null}, ${data.projectId ? data.projectRole ?? "editor" : null}, ${sha256(token)}, ${ctx.user.id}, now() + interval '14 days')`;
  const link = `${appUrl()}/invite/${token}`;
  const emailed = await sendMail(data.email, `${ctx.user.name} te invitó a «${ctx.ws.name}» en Orbita`,
    `Hola,\n\n${ctx.user.name} te invitó a colaborar en el espacio «${ctx.ws.name}» como ${ROLE_LABEL[data.role]}.\n\nAcepta la invitación aquí (válida 14 días):\n${link}\n`);
  await logActivity({ workspaceId: ctx.ws.id, projectId: data.projectId ?? null, actorId: ctx.user.id, entityType: "invitation", action: "member.invited", summary: `invitó a ${data.email} como ${ROLE_LABEL[data.role]}` });
  revalidatePath(`/w/${ctx.ws.slug}`, "layout");
  return {
    ok: true,
    message: emailed ? `Invitación enviada por correo a ${data.email}.` : "Invitación creada. Comparte este enlace con la persona invitada:",
    data: { link },
  };
});

export const revokeInvitation = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  const id = uuid.parse(fd.get("id"));
  const [inv] = await sql<{ email: string; invited_by: string }[]>`select email, invited_by from invitations where id = ${id} and workspace_id = ${ctx.ws.id}`;
  if (!inv) throw new AccessError();
  if (ctx.role !== "admin" && inv.invited_by !== ctx.user.id) throw new AccessError();
  await sql`update invitations set revoked_at = now() where id = ${id}`;
  await logActivity({ workspaceId: ctx.ws.id, actorId: ctx.user.id, entityType: "invitation", entityId: id, action: "member.invite_revoked", summary: `revocó la invitación de ${inv.email}` });
  revalidatePath(`/w/${ctx.ws.slug}/members`);
});

async function adminCount(wsId: string) {
  const [r] = await sql<{ c: number }[]>`select count(*)::int c from workspace_members where workspace_id = ${wsId} and role = 'admin'`;
  return r.c;
}

export const changeRole = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  if (ctx.role !== "admin") throw new AccessError();
  const userId = uuid.parse(fd.get("userId"));
  const newRole = role.parse(fd.get("role"));
  const [m] = await sql<{ role: WorkspaceRole; name: string }[]>`select wm.role, u.name from workspace_members wm join users u on u.id = wm.user_id where wm.workspace_id = ${ctx.ws.id} and wm.user_id = ${userId}`;
  if (!m) throw new AccessError();
  if (m.role === "admin" && newRole !== "admin" && (await adminCount(ctx.ws.id)) <= 1) throw new UserError("Debe quedar al menos un administrador");
  await sql`update workspace_members set role = ${newRole} where workspace_id = ${ctx.ws.id} and user_id = ${userId}`;
  await logActivity({ workspaceId: ctx.ws.id, actorId: ctx.user.id, entityType: "member", entityId: userId, action: "member.role_changed", summary: `cambió el rol de ${m.name} a ${ROLE_LABEL[newRole]}`, details: { from: m.role, to: newRole } });
  await notify([userId], { workspaceId: ctx.ws.id, actorId: ctx.user.id, kind: "role", title: `Tu rol en «${ctx.ws.name}» ahora es ${ROLE_LABEL[newRole]}`, link: `/w/${ctx.ws.slug}` });
  revalidatePath(`/w/${ctx.ws.slug}`, "layout");
});

export const removeMember = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  if (ctx.role !== "admin") throw new AccessError();
  const userId = uuid.parse(fd.get("userId"));
  const [m] = await sql<{ role: WorkspaceRole; name: string }[]>`select wm.role, u.name from workspace_members wm join users u on u.id = wm.user_id where wm.workspace_id = ${ctx.ws.id} and wm.user_id = ${userId}`;
  if (!m) throw new AccessError();
  if (m.role === "admin" && (await adminCount(ctx.ws.id)) <= 1) throw new UserError("No puedes quitar al único administrador");
  await sql.begin(async (tx) => {
    await tx`delete from project_members where user_id = ${userId} and project_id in (select id from projects where workspace_id = ${ctx.ws.id})`;
    await tx`delete from team_members where user_id = ${userId} and team_id in (select id from teams where workspace_id = ${ctx.ws.id})`;
    await tx`delete from task_collaborators where user_id = ${userId} and task_id in (select id from tasks where workspace_id = ${ctx.ws.id})`;
    await tx`delete from workspace_members where workspace_id = ${ctx.ws.id} and user_id = ${userId}`;
  });
  await logActivity({ workspaceId: ctx.ws.id, actorId: ctx.user.id, entityType: "member", entityId: userId, action: "member.removed", summary: `revocó el acceso de ${m.name} al espacio` });
  revalidatePath(`/w/${ctx.ws.slug}`, "layout");
});

export const acceptInvitation = safeAction(async (fd) => {
  const user = await requireUser();
  const token = z.string().min(10).parse(fd.get("token"));
  const [inv] = await sql<{ id: string; workspace_id: string; email: string; role: WorkspaceRole; project_id: string | null; project_role: string | null; invited_by: string | null; slug: string }[]>`
    select i.*, w.slug from invitations i join workspaces w on w.id = i.workspace_id
    where i.token_hash = ${sha256(token)} and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()`;
  if (!inv) throw new UserError("La invitación no es válida, fue revocada o ha caducado");
  if (inv.email.toLowerCase() !== user.email.toLowerCase())
    throw new UserError(`Esta invitación es para ${inv.email}. Inicia sesión con esa cuenta para aceptarla.`);
  await sql.begin(async (tx) => {
    await tx`insert into workspace_members (workspace_id, user_id, role) values (${inv.workspace_id}, ${user.id}, ${inv.role})
      on conflict (workspace_id, user_id) do nothing`;
    if (inv.project_id) {
      await tx`insert into project_members (project_id, user_id, role) values (${inv.project_id}, ${user.id}, ${inv.project_role ?? "editor"})
        on conflict (project_id, user_id) do update set role = excluded.role`;
    }
    await tx`update invitations set accepted_at = now() where id = ${inv.id}`;
  });
  await logActivity({ workspaceId: inv.workspace_id, projectId: inv.project_id, actorId: user.id, entityType: "member", entityId: user.id, action: "member.joined", summary: `se unió al espacio como ${ROLE_LABEL[inv.role]}` });
  await notify([inv.invited_by], { workspaceId: inv.workspace_id, actorId: user.id, kind: "invite", title: `${user.name} aceptó tu invitación`, link: `/w/${inv.slug}/members` });
  redirect(inv.project_id ? `/w/${inv.slug}/projects/${inv.project_id}` : `/w/${inv.slug}`);
});
