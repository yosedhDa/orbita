"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { randomToken } from "@/lib/crypto";
import { safeAction, UserError } from "@/lib/action";
import { AccessError, LEVEL, requireProject, wsContextById } from "@/lib/access";
import { logActivity, notify } from "@/lib/events";

const uuid = z.string().uuid();
const optUuid = z.preprocess((v) => (v ? v : null), uuid.nullable());
const optDate = z.preprocess((v) => (v ? v : null), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable());

// ── Automatizaciones ───────────────────────────────────────────────────
export const createAutomation = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  const projectId = uuid.parse(fd.get("projectId"));
  const p = await requireProject(ctx, projectId, LEVEL.admin);
  const d = z.object({
    name: z.string().trim().min(2, "Ponle un nombre a la regla").max(100),
    trigger: z.enum(["task_created", "status_changed"]),
    triggerStatus: z.preprocess((v) => (v ? v : null), z.enum(["pending", "in_progress", "in_review", "done"]).nullable()),
    action: z.enum(["set_assignee", "set_priority", "set_status", "notify_user", "add_checklist", "add_comment"]),
    actionValue: z.string().trim().max(2000),
  }).parse({ name: fd.get("name"), trigger: fd.get("trigger"), triggerStatus: fd.get("triggerStatus"), action: fd.get("action"), actionValue: fd.get(`value_${fd.get("action")}`) ?? "" });
  if (!d.actionValue) throw new UserError("Completa el valor de la acción");
  if (d.action === "set_assignee" || d.action === "notify_user") {
    const ok = await sql`select 1 from workspace_members where workspace_id = ${ctx.ws.id} and user_id = ${uuid.parse(d.actionValue)}
      and project_access_level(user_id, ${projectId}) >= 1`;
    if (!ok.length) throw new UserError("La persona elegida no tiene acceso al proyecto");
  }
  if (d.action === "set_priority") z.enum(["high", "medium", "low"]).parse(d.actionValue);
  if (d.action === "set_status") {
    z.enum(["pending", "in_progress", "in_review", "done"]).parse(d.actionValue);
    if (d.trigger === "status_changed" && d.triggerStatus === d.actionValue) throw new UserError("La regla se dispararía a sí misma");
  }
  await sql`insert into automations (workspace_id, project_id, name, trigger, trigger_status, action, action_value, created_by)
    values (${ctx.ws.id}, ${projectId}, ${d.name}, ${d.trigger}, ${d.trigger === "status_changed" ? d.triggerStatus : null}, ${d.action}, ${d.actionValue}, ${ctx.user.id})`;
  await logActivity({ workspaceId: ctx.ws.id, projectId, actorId: ctx.user.id, entityType: "project", entityId: projectId, action: "automation.created", summary: `creó la automatización «${d.name}» en «${p.name}»` });
  revalidatePath(`/w/${ctx.ws.slug}/projects/${projectId}`);
  return { ok: true, message: "Automatización creada" };
});

export const toggleAutomation = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  const id = uuid.parse(fd.get("automationId"));
  const [a] = await sql<{ project_id: string; name: string }[]>`select project_id, name from automations where id = ${id} and workspace_id = ${ctx.ws.id}`;
  if (!a) throw new AccessError();
  await requireProject(ctx, a.project_id, LEVEL.admin);
  if (fd.get("delete")) {
    await sql`delete from automations where id = ${id}`;
    await logActivity({ workspaceId: ctx.ws.id, projectId: a.project_id, actorId: ctx.user.id, entityType: "project", entityId: a.project_id, action: "automation.deleted", summary: `eliminó la automatización «${a.name}»` });
  } else await sql`update automations set enabled = not enabled where id = ${id}`;
  revalidatePath(`/w/${ctx.ws.slug}/projects/${a.project_id}`);
});

// ── Objetivos y KPI ────────────────────────────────────────────────────
const goalFields = z.object({
  title: z.string().trim().min(2, "Escribe el objetivo").max(200),
  description: z.string().max(2000).default(""),
  ownerId: optUuid,
  teamId: optUuid,
  metricType: z.enum(["manual", "project_progress", "tasks_completed"]),
  targetValue: z.coerce.number().positive("La meta debe ser mayor que 0").max(1e9),
  unit: z.string().trim().max(20).default(""),
  startDate: optDate,
  dueDate: optDate,
  projectIds: z.array(uuid).max(50),
});

function parseGoal(fd: FormData) {
  const g = goalFields.parse({
    title: fd.get("title"), description: fd.get("description") ?? "", ownerId: fd.get("ownerId"), teamId: fd.get("teamId"),
    metricType: fd.get("metricType"), targetValue: fd.get("targetValue"), unit: fd.get("unit") ?? "",
    startDate: fd.get("startDate"), dueDate: fd.get("dueDate"), projectIds: fd.getAll("projectIds"),
  });
  if (g.metricType === "project_progress") { g.targetValue = Math.min(g.targetValue, 100); g.unit = "%"; }
  if (g.metricType === "tasks_completed") g.unit = "tareas";
  if (g.metricType !== "manual" && !g.projectIds.length) throw new UserError("Vincula al menos un proyecto para calcular el indicador");
  return g;
}

async function canManageGoals(role: string) {
  return role === "admin" || role === "leader";
}

export const saveGoal = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  const id = optUuid.parse(fd.get("goalId"));
  const g = parseGoal(fd);
  if (id) {
    const [cur] = await sql<{ owner_id: string | null }[]>`select owner_id from goals where id = ${id} and workspace_id = ${ctx.ws.id}`;
    if (!cur) throw new AccessError();
    if (!(await canManageGoals(ctx.role)) && cur.owner_id !== ctx.user.id) throw new AccessError();
  } else if (!(await canManageGoals(ctx.role))) throw new AccessError("Sólo administradores y líderes pueden crear objetivos");
  if (g.ownerId) {
    const ok = await sql`select 1 from workspace_members where workspace_id = ${ctx.ws.id} and user_id = ${g.ownerId} and role <> 'guest'`;
    if (!ok.length) throw new UserError("Responsable no válido");
  }
  if (g.teamId && !(await sql`select 1 from teams where id = ${g.teamId} and workspace_id = ${ctx.ws.id}`).length) throw new UserError("Equipo no válido");
  if (g.projectIds.length) {
    const ok = await sql`select id from projects where workspace_id = ${ctx.ws.id} and id in ${sql(g.projectIds)} and project_access_level(${ctx.user.id}, id) >= 1`;
    if (ok.length !== new Set(g.projectIds).size) throw new UserError("Algún proyecto no es válido");
  }
  let goalId = id;
  await sql.begin(async (tx) => {
    if (goalId) {
      await tx`update goals set title = ${g.title}, description = ${g.description}, owner_id = ${g.ownerId}, team_id = ${g.teamId}, metric_type = ${g.metricType},
        target_value = ${g.targetValue}, unit = ${g.unit}, start_date = ${g.startDate}, due_date = ${g.dueDate}, updated_at = now() where id = ${goalId}`;
      await tx`delete from goal_projects where goal_id = ${goalId}`;
    } else {
      const [r] = await tx<{ id: string }[]>`insert into goals (workspace_id, team_id, owner_id, title, description, metric_type, target_value, unit, start_date, due_date, created_by)
        values (${ctx.ws.id}, ${g.teamId}, ${g.ownerId ?? ctx.user.id}, ${g.title}, ${g.description}, ${g.metricType}, ${g.targetValue}, ${g.unit}, ${g.startDate}, ${g.dueDate}, ${ctx.user.id}) returning id`;
      goalId = r.id;
    }
    if (g.projectIds.length) await tx`insert into goal_projects ${tx([...new Set(g.projectIds)].map((project_id) => ({ goal_id: goalId!, project_id })))}`;
  });
  await logActivity({ workspaceId: ctx.ws.id, actorId: ctx.user.id, entityType: "goal", entityId: goalId, action: id ? "goal.updated" : "goal.created", summary: `${id ? "actualizó" : "creó"} el objetivo «${g.title}»` });
  if (!id && g.ownerId) await notify([g.ownerId], { workspaceId: ctx.ws.id, actorId: ctx.user.id, kind: "goal", title: `${ctx.user.name} te nombró responsable del objetivo «${g.title}»`, link: `/w/${ctx.ws.slug}/goals` });
  revalidatePath(`/w/${ctx.ws.slug}/goals`);
  return { ok: true, message: "Objetivo guardado" };
});

export const addGoalUpdate = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  const id = uuid.parse(fd.get("goalId"));
  const [g] = await sql<{ owner_id: string | null; metric_type: string; title: string }[]>`select owner_id, metric_type, title from goals where id = ${id} and workspace_id = ${ctx.ws.id}`;
  if (!g || ctx.role === "guest") throw new AccessError();
  if (!(await canManageGoals(ctx.role)) && g.owner_id !== ctx.user.id) throw new AccessError("Sólo el responsable, líderes o administradores pueden actualizar el objetivo");
  const value = g.metric_type === "manual" ? z.coerce.number().min(0).max(1e9).parse(fd.get("value")) : null;
  const note = z.string().trim().max(1000).parse(fd.get("note") ?? "");
  if (value === null && !note) throw new UserError("Escribe una nota");
  await sql`insert into goal_updates (goal_id, value, note, author_id) values (${id}, ${value}, ${note}, ${ctx.user.id})`;
  if (value !== null) await sql`update goals set current_value = ${value}, updated_at = now() where id = ${id}`;
  await logActivity({ workspaceId: ctx.ws.id, actorId: ctx.user.id, entityType: "goal", entityId: id, action: "goal.progress", summary: `actualizó el avance del objetivo «${g.title}»${value !== null ? ` a ${value}` : ""}` });
  revalidatePath(`/w/${ctx.ws.slug}/goals`);
  return { ok: true, message: "Avance registrado" };
});

export const deleteGoal = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  if (!(await canManageGoals(ctx.role))) throw new AccessError();
  const id = uuid.parse(fd.get("goalId"));
  const [g] = await sql<{ title: string }[]>`delete from goals where id = ${id} and workspace_id = ${ctx.ws.id} returning title`;
  if (g) await logActivity({ workspaceId: ctx.ws.id, actorId: ctx.user.id, entityType: "goal", entityId: id, action: "goal.deleted", summary: `eliminó el objetivo «${g.title}»` });
  revalidatePath(`/w/${ctx.ws.slug}/goals`);
});

// ── Suscripción de calendario ──────────────────────────────────────────
export const resetCalendarToken = safeAction(async (fd) => {
  const user = await requireUser();
  const disable = fd.get("disable") === "1";
  await sql`update users set calendar_token = ${disable ? null : randomToken(24)} where id = ${user.id}`;
  revalidatePath("/account");
  return { ok: true, message: disable ? "Suscripción desactivada" : "Nueva URL generada. La anterior dejó de funcionar." };
});
