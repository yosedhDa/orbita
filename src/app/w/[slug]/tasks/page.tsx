import Link from "next/link";
import clsx from "clsx";
import { CalendarDays, Kanban, LayoutList } from "lucide-react";
import { getWsContext } from "@/lib/access";
import { sql } from "@/lib/db";
import { listTasks, visibleMembers } from "@/lib/queries";
import { PageHeader, todayStr } from "@/components/ui";
import { KanbanBoard } from "@/components/Kanban";
import { QuickAddTask } from "@/components/QuickAddTask";
import { TaskListView, TaskMonthCalendar, linkBase } from "@/components/TaskViews";
import { TaskDrawer } from "@/components/TaskDrawer";
import { STATUS_LABEL, STATUS_ORDER } from "@/lib/labels";

export const metadata = { title: "Tareas" };
type SP = { view?: string; scope?: string; assignee?: string; status?: string; due?: string; task?: string; month?: string; project?: string };

export default async function TasksPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getWsContext(slug);
  const base = `/w/${slug}`;
  const path = `${base}/tasks`;
  const view = sp.view ?? "list";
  const scope = sp.assignee ? "person" : sp.scope ?? "mine";
  const today = todayStr();

  const [all, members, editable] = await Promise.all([
    listTasks(ctx, scope === "mine" ? { assigneeId: ctx.user.id } : sp.assignee ? { assigneeId: sp.assignee } : {}),
    visibleMembers(ctx),
    sql<{ id: string; name: string }[]>`select id, name from projects where workspace_id = ${ctx.ws.id} and status in ('active','on_hold')
      and project_access_level(${ctx.user.id}, id) >= 2 order by name`,
  ]);
  const editableIds = new Set(editable.map((p) => p.id));
  const tasks = all.filter((t) =>
    (!sp.status || t.status === sp.status) && (!sp.project || t.project_id === sp.project) &&
    (sp.due !== "overdue" || (t.status !== "done" && t.due_date && t.due_date < today)));
  const lb = linkBase(path, sp);
  const person = sp.assignee ? members.find((m) => m.id === sp.assignee) : null;
  const projects = [...new Map(all.map((t) => [t.project_id, t.project_name])).entries()];
  const q = (patch: Partial<SP>) => linkBase(path, { ...sp, ...patch, task: undefined }).replace(/[?&]$/, "");
  const myId = ctx.user.id;

  return (
    <>
      <PageHeader title={person ? `Tareas de ${person.name}` : scope === "mine" ? "Mis tareas" : "Todas las tareas"} subtitle={`${tasks.length} tarea(s)`} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg bg-ink-100 p-1">
          <Link href={q({ scope: "mine", assignee: undefined })} className={clsx("rounded-md px-3 py-1 text-sm", scope === "mine" ? "bg-white font-medium shadow-sm" : "text-ink-600")}>Asignadas a mí</Link>
          <Link href={q({ scope: "all", assignee: undefined })} className={clsx("rounded-md px-3 py-1 text-sm", scope === "all" ? "bg-white font-medium shadow-sm" : "text-ink-600")}>Todas</Link>
        </div>
        <div className="flex gap-1 rounded-lg bg-ink-100 p-1">
          {[["list", "Lista", LayoutList], ["board", "Tablero", Kanban], ["calendar", "Calendario", CalendarDays]].map(([k, l, I]) => {
            const Icon = I as typeof LayoutList;
            return <Link key={k as string} href={q({ view: k as string })} className={clsx("flex items-center gap-1.5 rounded-md px-3 py-1 text-sm", view === k ? "bg-white font-medium shadow-sm" : "text-ink-600")}><Icon className="h-4 w-4" />{l as string}</Link>;
          })}
        </div>
      </div>
      <form className="mb-4 flex flex-wrap gap-2">
        <input type="hidden" name="view" value={view} /><input type="hidden" name="scope" value={scope === "person" ? "all" : scope} />
        <select name="assignee" defaultValue={sp.assignee ?? ""} className="input w-auto py-1.5" aria-label="Responsable">
          <option value="">Cualquier responsable</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select name="project" defaultValue={sp.project ?? ""} className="input w-auto py-1.5" aria-label="Proyecto">
          <option value="">Todos los proyectos</option>{projects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select name="status" defaultValue={sp.status ?? ""} className="input w-auto py-1.5" aria-label="Estado">
          <option value="">Todos los estados</option>{STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select name="due" defaultValue={sp.due ?? ""} className="input w-auto py-1.5" aria-label="Vencimiento"><option value="">Cualquier fecha</option><option value="overdue">Sólo vencidas</option></select>
        <button className="btn-secondary py-1.5">Filtrar</button>
      </form>

      {view === "list" && editable.length > 0 && (
        <div className="mb-4"><QuickAddTask workspaceId={ctx.ws.id} projects={editable} members={members.map((m) => ({ id: m.id, name: m.name }))} defaultAssignee={scope === "mine" ? ctx.user.id : sp.assignee} /></div>
      )}
      {view === "list" && <TaskListView tasks={tasks} base={lb} workspaceId={ctx.ws.id} showProject canToggle={(t) => editableIds.has(t.project_id) || t.assignee_id === myId} />}
      {view === "board" && <KanbanBoard workspaceId={ctx.ws.id} tasks={tasks.filter((t) => editableIds.has(t.project_id) || t.assignee_id === myId)} linkBase={lb} canEdit showProject />}
      {view === "calendar" && <TaskMonthCalendar tasks={tasks} month={sp.month ?? today.slice(0, 7)} base={lb} navBase={linkBase(path, { ...sp, month: undefined })} />}
      {sp.task && <TaskDrawer ctx={ctx} taskId={sp.task} closeHref={lb.replace(/[?&]$/, "")} base={base} />}
    </>
  );
}
