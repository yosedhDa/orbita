import Link from "next/link";
import clsx from "clsx";
import { Check, ChevronLeft, ChevronRight, GitBranch, MessageSquare, Paperclip } from "lucide-react";
import { toggleTaskDone } from "@/actions/tasks";
import { STATUS_LABEL, STATUS_ORDER, STATUS_STYLE } from "@/lib/labels";
import type { TaskItem } from "@/lib/queries";
import { ActionForm } from "./forms";
import { Avatar, DueDate, EmptyState, PriorityBadge, StatusBadge, todayStr } from "./ui";

/** Construye "ruta?params&" sin el parámetro task para enlazar tareas. */
export function linkBase(path: string, sp: Record<string, string | string[] | undefined>, extra: Record<string, string | undefined> = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...extra })) if (k !== "task" && typeof v === "string" && v) q.set(k, v);
  const s = q.toString();
  return `${path}?${s}${s ? "&" : ""}`;
}

export function TaskListView({ tasks, base, workspaceId, showProject, canToggle }: { tasks: TaskItem[]; base: string; workspaceId: string; showProject?: boolean; canToggle: (t: TaskItem) => boolean }) {
  if (!tasks.length) return <EmptyState title="No hay tareas" text="Usa el formulario de arriba para crear la primera." />;
  return (
    <div className="space-y-6">
      {STATUS_ORDER.map((s) => {
        const group = tasks.filter((t) => t.status === s);
        if (!group.length) return null;
        return (
          <section key={s} className="card overflow-hidden">
            <header className="flex items-center gap-2 border-b border-ink-100 bg-ink-50/60 px-4 py-2.5">
              <span className={clsx("h-2 w-2 rounded-full", STATUS_STYLE[s].dot)} />
              <h3 className="text-sm font-semibold">{STATUS_LABEL[s]}</h3>
              <span className="text-xs text-ink-500">{group.length}</span>
            </header>
            <ul className="divide-y divide-ink-100">
              {group.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-ink-50/60 sm:px-4" data-task-row={t.title}>
                  {canToggle(t) ? (
                    <ActionForm action={toggleTaskDone} hidden={{ workspaceId, taskId: t.id }} showMessage={false}>
                      <button aria-label={t.status === "done" ? "Marcar como pendiente" : "Marcar como completada"}
                        className={clsx("flex h-5 w-5 items-center justify-center rounded-full border-2 transition", t.status === "done" ? "border-emerald-500 bg-emerald-500 text-white" : "border-ink-300 hover:border-emerald-500")}>
                        {t.status === "done" && <Check className="h-3 w-3" strokeWidth={3} />}
                      </button>
                    </ActionForm>
                  ) : <span className="h-5 w-5" />}
                  <Link href={`${base}task=${t.id}`} scroll={false} className="min-w-0 flex-1">
                    <span className={clsx("block truncate text-sm", t.status === "done" ? "text-ink-400 line-through" : "text-ink-900")}>{t.parent_id && <span className="text-ink-400">↳ </span>}{t.title}</span>
                    {showProject && <span className="mt-0.5 flex items-center gap-1 text-xs text-ink-500"><span className="h-2 w-2 rounded-sm" style={{ background: t.project_color }} />{t.project_name}</span>}
                  </Link>
                  <span className="hidden items-center gap-2 text-xs text-ink-400 md:flex">
                    {t.subtasks > 0 && <span className="flex items-center gap-0.5"><GitBranch className="h-3 w-3" />{t.subtasks_done}/{t.subtasks}</span>}
                    {t.comments > 0 && <span className="flex items-center gap-0.5"><MessageSquare className="h-3 w-3" />{t.comments}</span>}
                    {t.attachments > 0 && <span className="flex items-center gap-0.5"><Paperclip className="h-3 w-3" />{t.attachments}</span>}
                  </span>
                  <span className="hidden sm:block"><PriorityBadge priority={t.priority} /></span>
                  <span className="w-14 text-right"><DueDate date={t.due_date} done={t.status === "done"} /></span>
                  <Avatar name={t.assignee_name} color={t.assignee_color} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export function monthGrid(month: string) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const start = new Date(first.getTime() - offset * 864e5);
  const days: string[] = [];
  for (let i = 0; i < 42; i++) days.push(new Date(start.getTime() + i * 864e5).toISOString().slice(0, 10));
  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  return { days, prev, next, label: `${MONTHS[m - 1]} ${y}` };
}

export function TaskMonthCalendar({ tasks, month, base, navBase }: { tasks: TaskItem[]; month: string; base: string; navBase: string }) {
  const { days, prev, next, label } = monthGrid(month);
  const today = todayStr();
  const noDate = tasks.filter((t) => !t.due_date).length;
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
        <h3 className="font-semibold">{label}</h3>
        <div className="flex gap-1">
          <Link href={`${navBase}month=${prev}`} className="btn-ghost p-1.5" aria-label="Mes anterior"><ChevronLeft className="h-4 w-4" /></Link>
          <Link href={`${navBase}month=${today.slice(0, 7)}`} className="btn-ghost btn-sm">Hoy</Link>
          <Link href={`${navBase}month=${next}`} className="btn-ghost p-1.5" aria-label="Mes siguiente"><ChevronRight className="h-4 w-4" /></Link>
        </div>
      </div>
      <div className="grid grid-cols-7 border-b border-ink-100 bg-ink-50 text-center text-[11px] font-medium uppercase text-ink-500">
        {WEEKDAYS.map((d) => <div key={d} className="py-2">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const items = tasks.filter((t) => t.due_date === d);
          return (
            <div key={d} className={clsx("min-h-[72px] border-b border-r border-ink-100 p-1 sm:min-h-[104px]", d.slice(0, 7) !== month && "bg-ink-50/60")}>
              <div className={clsx("mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs", d === today ? "bg-brand-600 font-semibold text-white" : "text-ink-500")}>{Number(d.slice(8))}</div>
              <div className="space-y-0.5">
                {items.slice(0, 3).map((t) => (
                  <Link key={t.id} href={`${base}task=${t.id}`} scroll={false} title={t.title}
                    className={clsx("block truncate rounded px-1 py-0.5 text-[10px] sm:text-[11px]", STATUS_STYLE[t.status].badge, t.status === "done" && "line-through")}>
                    {t.title}
                  </Link>
                ))}
                {items.length > 3 && <span className="block px-1 text-[10px] text-ink-500">+{items.length - 3} más</span>}
              </div>
            </div>
          );
        })}
      </div>
      {noDate > 0 && <p className="px-4 py-2 text-xs text-ink-500">{noDate} tarea(s) sin fecha límite no aparecen en el calendario.</p>}
    </div>
  );
}

export { StatusBadge };
