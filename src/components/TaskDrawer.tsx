import Link from "next/link";
import { X, Trash2, Check, FileText, Plus } from "lucide-react";
import clsx from "clsx";
import { sql } from "@/lib/db";
import { LEVEL, taskLevel, type WsContext } from "@/lib/access";
import { listActivity, visibleMembers } from "@/lib/queries";
import { addChecklistItem, deleteTask, toggleChecklistItem, toggleTaskDone } from "@/actions/tasks";
import { createDocument } from "@/actions/docs";
import { ActionButton, ActionForm, SubmitButton } from "./forms";
import { TaskEditor } from "./TaskEditor";
import { QuickAddTask } from "./QuickAddTask";
import { ActivityList, Attachments, Comments } from "./Collab";
import { Avatar, DueDate, StatusBadge, timeAgo } from "./ui";
import type { TaskStatus } from "@/lib/labels";

/** Panel lateral con el detalle completo de una tarea (?task=id). */
export async function TaskDrawer({ ctx, taskId, closeHref, base }: { ctx: WsContext; taskId: string; closeHref: string; base: string }) {
  if (!/^[0-9a-f-]{36}$/.test(taskId)) return null;
  const access = await taskLevel(ctx.user.id, taskId);
  if (!access || access.workspace_id !== ctx.ws.id || access.level < LEVEL.view) {
    return (
      <Shell closeHref={closeHref}><p className="text-sm text-ink-500">La tarea no existe o no tienes acceso.</p></Shell>
    );
  }
  const canEdit = access.level >= LEVEL.edit;
  const [[task], subtasks, checklist, collabs, allMembers, history, docs] = await Promise.all([
    sql<{ id: string; title: string; description: string; status: TaskStatus; priority: string; assignee_id: string | null; due_date: string | null; start_date: string | null;
      created_at: Date; creator: string | null; project_id: string; project_name: string; project_color: string; parent_id: string | null; parent_title: string | null; completed_at: Date | null }[]>`
      select t.id, t.title, t.description, t.status, t.priority, t.assignee_id, to_char(t.due_date, 'YYYY-MM-DD') as due_date, to_char(t.start_date, 'YYYY-MM-DD') as start_date,
        t.created_at, u.name as creator, t.project_id, p.name as project_name, p.color as project_color, t.parent_id, pt.title as parent_title, t.completed_at
      from tasks t join projects p on p.id = t.project_id left join users u on u.id = t.created_by left join tasks pt on pt.id = t.parent_id
      where t.id = ${taskId}`,
    sql<{ id: string; title: string; status: TaskStatus; due_date: string | null; assignee_name: string | null; assignee_color: string | null }[]>`
      select t.id, t.title, t.status, to_char(t.due_date, 'YYYY-MM-DD') as due_date, u.name as assignee_name, u.avatar_color as assignee_color
      from tasks t left join users u on u.id = t.assignee_id where t.parent_id = ${taskId} order by t.created_at`,
    sql<{ id: string; text: string; done: boolean }[]>`select id, text, done from checklist_items where task_id = ${taskId} order by position`,
    sql<{ user_id: string }[]>`select user_id from task_collaborators where task_id = ${taskId}`,
    visibleMembers(ctx),
    listActivity(ctx, { entity: { type: "task", id: taskId }, limit: 30 }),
    sql<{ id: string; title: string; icon: string }[]>`select id, title, icon from documents where task_id = ${taskId} and document_access_level(${ctx.user.id}, id) >= 1`,
  ]);
  // Sólo personas con acceso al proyecto pueden asignarse
  const allowed = await sql<{ user_id: string }[]>`select user_id from workspace_members where workspace_id = ${ctx.ws.id} and project_access_level(user_id, ${task.project_id}) >= 1`;
  const allowedIds = new Set(allowed.map((a) => a.user_id));
  const members = allMembers.filter((m) => allowedIds.has(m.id));
  const w = { workspaceId: ctx.ws.id, userId: ctx.user.id, isAdmin: ctx.role === "admin" };
  const projectLvl = (await sql<{ l: number }[]>`select project_access_level(${ctx.user.id}, ${task.project_id}) l`)[0].l;
  const subHref = (id: string) => closeHref + (closeHref.includes("?") ? "&" : "?") + `task=${id}`;

  return (
    <Shell closeHref={closeHref}>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-ink-500">
        <Link href={`${base}/projects/${task.project_id}`} className="flex items-center gap-1.5 hover:underline"><span className="h-2 w-2 rounded-sm" style={{ background: task.project_color }} />{task.project_name}</Link>
        {task.parent_id && <>/ <Link href={subHref(task.parent_id)} scroll={false} className="hover:underline">{task.parent_title}</Link></>}
        <span className="ml-auto flex items-center gap-2">
          <StatusBadge status={task.status} />
          {canEdit && (
            <ActionForm action={toggleTaskDone} hidden={{ workspaceId: ctx.ws.id, taskId }} showMessage={false}>
              <SubmitButton className={clsx("btn-sm px-2 py-1", task.status === "done" ? "btn-secondary" : "btn-primary bg-emerald-600 hover:bg-emerald-700")}>
                <Check className="h-3.5 w-3.5" />{task.status === "done" ? "Reabrir" : "Completar"}
              </SubmitButton>
            </ActionForm>
          )}
        </span>
      </div>

      <TaskEditor key={[task.id, task.status, task.priority, task.assignee_id, task.due_date, task.start_date, task.title, collabs.length].join("|")} workspaceId={ctx.ws.id} readOnly={!canEdit} members={members} collaborators={collabs.map((c) => c.user_id)}
        task={{ id: task.id, title: task.title, description: task.description, status: task.status, priority: task.priority, assignee_id: task.assignee_id, due_date: task.due_date, start_date: task.start_date }} />
      <p className="mt-3 text-xs text-ink-400">Creada {timeAgo(task.created_at)} por {task.creator ?? "—"}{task.completed_at && ` · Completada ${timeAgo(task.completed_at)}`}</p>

      {!task.parent_id && (
        <Section title={`Subtareas (${subtasks.filter((s) => s.status === "done").length}/${subtasks.length})`}>
          <ul className="mb-2 space-y-1">
            {subtasks.map((s) => (
              <li key={s.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-ink-50">
                <span className={clsx("h-2 w-2 rounded-full", s.status === "done" ? "bg-emerald-500" : "bg-ink-300")} />
                <Link href={subHref(s.id)} scroll={false} className={clsx("flex-1 truncate text-sm", s.status === "done" && "text-ink-400 line-through")}>{s.title}</Link>
                <DueDate date={s.due_date} done={s.status === "done"} />
                <Avatar name={s.assignee_name} color={s.assignee_color} size={20} />
              </li>
            ))}
          </ul>
          {canEdit && projectLvl >= LEVEL.edit && <QuickAddTask workspaceId={ctx.ws.id} projects={[{ id: task.project_id, name: task.project_name }]} members={members} parentId={taskId} compact />}
        </Section>
      )}

      <Section title={`Checklist (${checklist.filter((c) => c.done).length}/${checklist.length})`}>
        <ul className="mb-2 space-y-1">
          {checklist.map((c) => (
            <li key={c.id} className="group flex items-center gap-2 px-1">
              <ActionForm action={toggleChecklistItem} hidden={{ workspaceId: ctx.ws.id, itemId: c.id }} showMessage={false}>
                <button disabled={!canEdit} aria-label={c.done ? "Desmarcar" : "Marcar"} className={clsx("flex h-4 w-4 items-center justify-center rounded border", c.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-ink-300")}>
                  {c.done && <Check className="h-3 w-3" strokeWidth={3} />}
                </button>
              </ActionForm>
              <span className={clsx("flex-1 text-sm", c.done && "text-ink-400 line-through")}>{c.text}</span>
              {canEdit && <span className="opacity-0 group-hover:opacity-100"><ActionButton action={toggleChecklistItem} hidden={{ workspaceId: ctx.ws.id, itemId: c.id, delete: "1" }} title="Eliminar"><X className="h-3 w-3" /></ActionButton></span>}
            </li>
          ))}
        </ul>
        {canEdit && (
          <ActionForm action={addChecklistItem} hidden={{ workspaceId: ctx.ws.id, taskId }} resetOnSuccess className="flex gap-2">
            <input name="text" required maxLength={300} placeholder="Añadir elemento…" className="input py-1.5" aria-label="Nuevo elemento del checklist" />
            <SubmitButton className="btn-secondary py-1.5"><Plus className="h-4 w-4" /></SubmitButton>
          </ActionForm>
        )}
      </Section>

      <Section title="Archivos adjuntos"><Attachments ctx={w} type="task" id={taskId} canEdit={canEdit} /></Section>

      <Section title="Documentos vinculados">
        <ul className="mb-2 space-y-1">{docs.map((d) => <li key={d.id}><Link href={`${base}/docs/${d.id}`} className="flex items-center gap-2 text-sm hover:underline"><span>{d.icon}</span>{d.title}</Link></li>)}</ul>
        {docs.length === 0 && <p className="mb-2 text-sm text-ink-500">Ningún documento vinculado.</p>}
        {canEdit && projectLvl >= LEVEL.edit && (
          <ActionForm action={createDocument} hidden={{ workspaceId: ctx.ws.id, taskId, projectId: task.project_id, isFolder: "0" }}>
            <SubmitButton className="btn-secondary btn-sm px-2.5 py-1.5"><FileText className="h-3.5 w-3.5" />Crear documento para esta tarea</SubmitButton>
          </ActionForm>
        )}
      </Section>

      <Section title="Comentarios">
        <Comments ctx={w} type="task" id={taskId} canComment={ctx.role === "guest" ? canEdit : true} members={members} />
      </Section>

      <Section title="Historial de modificaciones"><ActivityList items={history} empty="Sin cambios registrados." /></Section>

      {(projectLvl >= LEVEL.edit) && (
        <div className="mt-8 border-t border-ink-100 pt-4">
          <ActionForm action={deleteTask} hidden={{ workspaceId: ctx.ws.id, taskId }} confirm="¿Eliminar esta tarea y sus subtareas? Esta acción no se puede deshacer.">
            <SubmitButton className="btn-danger btn-sm px-2.5 py-1.5"><Trash2 className="h-3.5 w-3.5" />Eliminar tarea</SubmitButton>
          </ActionForm>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children, closeHref }: { children: React.ReactNode; closeHref: string }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <Link href={closeHref} scroll={false} className="absolute inset-0 bg-ink-900/30" aria-label="Cerrar panel" />
      <aside className="relative h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-2xl sm:p-6" role="dialog" aria-label="Detalle de tarea" data-testid="task-drawer">
        <Link href={closeHref} scroll={false} className="btn-ghost absolute right-3 top-3 p-1.5" aria-label="Cerrar"><X className="h-5 w-5" /></Link>
        <div className="pt-6">{children}</div>
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-500">{title}</h3>
      {children}
    </section>
  );
}
