"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { safeAction, UserError, type ActionResult } from "@/lib/action";
import { AccessError, LEVEL, requireProject, requireTask, wsContextById } from "@/lib/access";
import { logActivity, notify } from "@/lib/events";
import { runAutomations } from "@/lib/automations";
import { PRIORITY_LABEL, STATUS_LABEL, type Priority, type TaskStatus } from "@/lib/labels";

const uuid = z.string().uuid();
const optUuid = z.preprocess((v) => (v ? v : null), uuid.nullable());
const optDate = z.preprocess((v) => (v ? v : null), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable());
const status = z.enum(["pending", "in_progress", "in_review", "done"]);
const priority = z.enum(["high", "medium", "low"]);

async function assertAssignable(wsId: string, projectId: string, ids: (string | null)[]) {
  const list = [...new Set(ids.filter(Boolean) as string[])];
  if (!list.length) return;
  // Sólo personas con acceso al proyecto pueden ser responsables o colaboradores
  const r = await sql`select user_id from workspace_members where workspace_id = ${wsId} and user_id in ${sql(list)}
    and project_access_level(user_id, ${projectId}) >= 1`;
  if (r.length !== list.length) throw new UserError("Alguna persona seleccionada no tiene acceso a este proyecto");
}

function revalidate(slug: string) {
  revalidatePath(`/w/${slug}`, "layout");
}

export const createTask = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  const d = z.object({
    projectId: uuid,
    parentId: optUuid,
    title: z.string().trim().min(1, "Escribe un título").max(300),
    description: z.string().max(10000).default(""),
    assigneeId: optUuid,
    status: status.default("pending"),
    priority: priority.default("medium"),
    dueDate: optDate,
    startDate: optDate,
  }).parse({
    projectId: fd.get("projectId"), parentId: fd.get("parentId"), title: fd.get("title"), description: fd.get("description") ?? undefined,
    assigneeId: fd.get("assigneeId"), status: fd.get("status") || undefined, priority: fd.get("priority") || undefined,
    dueDate: fd.get("dueDate"), startDate: fd.get("startDate"),
  });
  const p = await requireProject(ctx, d.projectId, LEVEL.edit);
  if (d.parentId) {
    const parent = await sql`select 1 from tasks where id = ${d.parentId} and project_id = ${d.projectId}`;
    if (!parent.length) throw new UserError("Tarea principal no válida");
  }
  await assertAssignable(ctx.ws.id, d.projectId, [d.assigneeId]);
  const [{ pos }] = await sql<{ pos: number }[]>`select coalesce(max(position), 0) + 1000 as pos from tasks where project_id = ${d.projectId} and status = ${d.status}`;
  const [t] = await sql<{ id: string }[]>`insert into tasks
    (workspace_id, project_id, parent_id, title, description, assignee_id, status, priority, due_date, start_date, position, created_by, completed_at)
    values (${ctx.ws.id}, ${d.projectId}, ${d.parentId}, ${d.title}, ${d.description}, ${d.assigneeId}, ${d.status}, ${d.priority},
            ${d.dueDate}, ${d.startDate}, ${pos}, ${ctx.user.id}, ${d.status === "done" ? new Date() : null}) returning id`;
  await logActivity({ workspaceId: ctx.ws.id, projectId: d.projectId, actorId: ctx.user.id, entityType: "task", entityId: t.id, action: "task.created",
    summary: `creó ${d.parentId ? "la subtarea" : "la tarea"} «${d.title}» en ${p.name}` });
  await notify([d.assigneeId], { workspaceId: ctx.ws.id, actorId: ctx.user.id, kind: "assignment", title: `${ctx.user.name} te asignó «${d.title}»`, body: p.name, link: `/w/${ctx.ws.slug}/projects/${d.projectId}?task=${t.id}` });
  await runAutomations(ctx.ws, ctx.user, { type: "task_created", taskId: t.id });
  revalidate(ctx.ws.slug);
  return { ok: true, data: { id: t.id } };
});

type TaskRow = { id: string; title: string; description: string; assignee_id: string | null; status: TaskStatus; priority: Priority; due_date: string | null; start_date: string | null; project_id: string; created_by: string | null };

async function applyTaskChanges(ctx: Awaited<ReturnType<typeof wsContextById>>, taskId: string, patch: Partial<Omit<TaskRow, "id" | "project_id" | "created_by">>, collaborators?: string[]) {
  const [before] = await sql<TaskRow[]>`select id, title, description, assignee_id, status, priority, to_char(due_date, 'YYYY-MM-DD') as due_date,
    to_char(start_date, 'YYYY-MM-DD') as start_date, project_id, created_by from tasks where id = ${taskId}`;
  const changes: { field: string; from: unknown; to: unknown }[] = [];
  for (const [k, v] of Object.entries(patch) as [keyof typeof patch, unknown][]) {
    if (v !== undefined && before[k] !== v) changes.push({ field: k, from: before[k], to: v });
  }
  const next = { ...before, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) } as TaskRow;
  if (changes.length) {
    await sql`update tasks set title = ${next.title}, description = ${next.description}, assignee_id = ${next.assignee_id}, status = ${next.status},
      priority = ${next.priority}, due_date = ${next.due_date}, start_date = ${next.start_date}, updated_at = now(),
      completed_at = case when ${next.status} = 'done' then coalesce(completed_at, now()) else null end
      where id = ${taskId}`;
  }
  if (collaborators) {
    const cur = (await sql<{ user_id: string }[]>`select user_id from task_collaborators where task_id = ${taskId}`).map((r) => r.user_id);
    const added = collaborators.filter((c) => !cur.includes(c));
    const removed = cur.filter((c) => !collaborators.includes(c));
    if (removed.length) await sql`delete from task_collaborators where task_id = ${taskId} and user_id in ${sql(removed)}`;
    if (added.length) await sql`insert into task_collaborators ${sql(added.map((user_id) => ({ task_id: taskId, user_id })))}`;
    if (added.length || removed.length) changes.push({ field: "collaborators", from: cur.length, to: collaborators.length });
    await notify(added, { workspaceId: ctx.ws.id, actorId: ctx.user.id, kind: "assignment", title: `${ctx.user.name} te agregó como colaborador en «${next.title}»`, link: `/w/${ctx.ws.slug}/projects/${before.project_id}?task=${taskId}` });
  }
  if (!changes.length) return;

  const describe = (c: { field: string; from: unknown; to: unknown }) => {
    switch (c.field) {
      case "status": return `cambió el estado a ${STATUS_LABEL[c.to as TaskStatus]}`;
      case "priority": return `cambió la prioridad a ${PRIORITY_LABEL[c.to as Priority]}`;
      case "assignee_id": return c.to ? "cambió el responsable" : "quitó el responsable";
      case "due_date": return c.to ? `cambió la fecha límite a ${c.to}` : "quitó la fecha límite";
      case "start_date": return "cambió la fecha de inicio";
      case "title": return `renombró la tarea a «${c.to}»`;
      case "description": return "editó la descripción";
      case "collaborators": return "actualizó los colaboradores";
      default: return `cambió ${c.field}`;
    }
  };
  await logActivity({ workspaceId: ctx.ws.id, projectId: before.project_id, actorId: ctx.user.id, entityType: "task", entityId: taskId, action: "task.updated",
    summary: `${changes.map(describe).join(", ")} en «${next.title}»`, details: { changes } });

  const link = `/w/${ctx.ws.slug}/projects/${before.project_id}?task=${taskId}`;
  if (patch.assignee_id && patch.assignee_id !== before.assignee_id)
    await notify([patch.assignee_id], { workspaceId: ctx.ws.id, actorId: ctx.user.id, kind: "assignment", title: `${ctx.user.name} te asignó «${next.title}»`, link });
  if (patch.status && patch.status !== before.status) {
    const watchers = (await sql<{ user_id: string }[]>`select user_id from task_collaborators where task_id = ${taskId}`).map((r) => r.user_id);
    await notify([next.assignee_id, before.created_by, ...watchers], { workspaceId: ctx.ws.id, actorId: ctx.user.id, kind: "status",
      title: `«${next.title}» pasó a ${STATUS_LABEL[patch.status]}`, body: `Cambio realizado por ${ctx.user.name}`, link });
  }
  if (patch.status && patch.status !== before.status)
    await runAutomations(ctx.ws, ctx.user, { type: "status_changed", taskId, status: patch.status });
}

export const updateTask = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  const id = uuid.parse(fd.get("taskId"));
  const t = await requireTask(ctx, id, LEVEL.edit);
  const has = (k: string) => fd.has(k);
  const patch = {
    title: has("title") ? z.string().trim().min(1, "Escribe un título").max(300).parse(fd.get("title")) : undefined,
    description: has("description") ? z.string().max(10000).parse(fd.get("description")) : undefined,
    assignee_id: has("assigneeId") ? optUuid.parse(fd.get("assigneeId")) : undefined,
    status: has("status") ? status.parse(fd.get("status")) : undefined,
    priority: has("priority") ? priority.parse(fd.get("priority")) : undefined,
    due_date: has("dueDate") ? optDate.parse(fd.get("dueDate")) : undefined,
    start_date: has("startDate") ? optDate.parse(fd.get("startDate")) : undefined,
  };
  const collaborators = has("collaboratorsSent") ? z.array(uuid).parse(fd.getAll("collaborators")) : undefined;
  await assertAssignable(ctx.ws.id, t.project_id, [patch.assignee_id ?? null, ...(collaborators ?? [])]);
  // Quien sólo participa en la tarea (sin edición del proyecto) no puede reasignarla
  if (t.level < LEVEL.edit) throw new AccessError();
  await applyTaskChanges(ctx, id, patch, collaborators);
  revalidate(ctx.ws.slug);
  return { ok: true, message: "Tarea guardada" };
});

/** Mover tarea en el tablero Kanban (arrastrar y soltar). */
export async function moveTask(workspaceId: string, taskId: string, newStatus: string, beforeId: string | null): Promise<ActionResult> {
  try {
    const ctx = await wsContextById(uuid.parse(workspaceId));
    const st = status.parse(newStatus);
    const t = await requireTask(ctx, uuid.parse(taskId), LEVEL.edit);
    let pos: number;
    if (beforeId) {
      const [b] = await sql<{ position: number }[]>`select position from tasks where id = ${uuid.parse(beforeId)} and project_id = ${t.project_id}`;
      const [prev] = b
        ? await sql<{ position: number }[]>`select coalesce(max(position), ${b.position - 2000}) as position from tasks where project_id = ${t.project_id} and status = ${st} and position < ${b.position} and id <> ${t.id}`
        : [{ position: 0 }];
      pos = b ? (prev.position + b.position) / 2 : 0;
    } else {
      const [m] = await sql<{ p: number }[]>`select coalesce(max(position), 0) + 1000 as p from tasks where project_id = ${t.project_id} and status = ${st} and id <> ${t.id}`;
      pos = m.p;
    }
    await sql`update tasks set position = ${pos} where id = ${t.id}`;
    await applyTaskChanges(ctx, t.id, { status: st });
    revalidate(ctx.ws.slug);
    return { ok: true };
  } catch (e) {
    if (e instanceof AccessError || e instanceof UserError) return { error: e.message };
    console.error(e);
    return { error: "No se pudo mover la tarea" };
  }
}

export const toggleTaskDone = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  const id = uuid.parse(fd.get("taskId"));
  await requireTask(ctx, id, LEVEL.edit);
  const [t] = await sql<{ status: TaskStatus }[]>`select status from tasks where id = ${id}`;
  await applyTaskChanges(ctx, id, { status: t.status === "done" ? "pending" : "done" });
  revalidate(ctx.ws.slug);
});

export const deleteTask = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  const id = uuid.parse(fd.get("taskId"));
  const t = await requireTask(ctx, id, LEVEL.view);
  const [row] = await sql<{ created_by: string | null }[]>`select created_by from tasks where id = ${id}`;
  const projectLvl = (await sql<{ l: number }[]>`select project_access_level(${ctx.user.id}, ${t.project_id}) as l`)[0].l;
  if (projectLvl < LEVEL.edit && row.created_by !== ctx.user.id) throw new AccessError();
  await sql`delete from attachments where entity_type = 'task' and entity_id in (select id from tasks where id = ${id} or parent_id = ${id})`;
  await sql`delete from comments where entity_type = 'task' and entity_id in (select id from tasks where id = ${id} or parent_id = ${id})`;
  await sql`delete from tasks where id = ${id}`;
  await logActivity({ workspaceId: ctx.ws.id, projectId: t.project_id, actorId: ctx.user.id, entityType: "task", entityId: id, action: "task.deleted", summary: `eliminó la tarea «${t.title}»` });
  revalidate(ctx.ws.slug);
});

export const addChecklistItem = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  const id = uuid.parse(fd.get("taskId"));
  await requireTask(ctx, id, LEVEL.edit);
  const text = z.string().trim().min(1, "Escribe el elemento").max(300).parse(fd.get("text"));
  await sql`insert into checklist_items (task_id, text, position)
    values (${id}, ${text}, (select coalesce(max(position), 0) + 1 from checklist_items where task_id = ${id}))`;
  revalidate(ctx.ws.slug);
});

export const toggleChecklistItem = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  const itemId = uuid.parse(fd.get("itemId"));
  const [it] = await sql<{ task_id: string }[]>`select task_id from checklist_items where id = ${itemId}`;
  if (!it) throw new AccessError();
  await requireTask(ctx, it.task_id, LEVEL.edit);
  if (fd.get("delete")) await sql`delete from checklist_items where id = ${itemId}`;
  else await sql`update checklist_items set done = not done where id = ${itemId}`;
  revalidate(ctx.ws.slug);
});
