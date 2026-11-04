import Link from "next/link";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, Trash2, BellRing } from "lucide-react";
import { getWsContext } from "@/lib/access";
import { sql } from "@/lib/db";
import { listEvents, listProjects, listTasks, visibleMembers, type EventItem, type TaskItem } from "@/lib/queries";
import { createEvent, deleteEvent } from "@/actions/collab";
import { Avatar, PageHeader, fmtDate, todayStr, tzDate, tzTime } from "@/components/ui";
import { ActionButton, Modal } from "@/components/forms";
import { EventForm } from "@/components/EventForm";
import { linkBase, monthGrid } from "@/components/TaskViews";
import { TaskDrawer } from "@/components/TaskDrawer";
import { STATUS_STYLE } from "@/lib/labels";

export const metadata = { title: "Calendario" };
type SP = { mode?: string; date?: string; assignee?: string; project?: string; task?: string };
const DAY = 864e5;
const WD = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => iso(new Date(new Date(`${s}T00:00:00Z`).getTime() + n * DAY));
const weekStart = (s: string) => { const d = new Date(`${s}T00:00:00Z`); return addDays(s, -((d.getUTCDay() + 6) % 7)); };

type Item = { key: string; date: string; title: string; href?: string; kind: "task" | "meeting" | "milestone" | "project_end"; color: string; time?: string; done?: boolean; ev?: EventItem };

export default async function CalendarPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getWsContext(slug);
  const base = `/w/${slug}`;
  const path = `${base}/calendar`;
  const mode = sp.mode ?? "month";
  const today = todayStr();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : today;

  let from: string, to: string, prev: string, next: string, label: string;
  if (mode === "week") { from = weekStart(date); to = addDays(from, 6); prev = addDays(from, -7); next = addDays(from, 7); label = `${fmtDate(from)} – ${fmtDate(to, true)}`; }
  else if (mode === "day") { from = to = date; prev = addDays(date, -1); next = addDays(date, 1); label = new Date(`${date}T12:00:00Z`).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }); }
  else if (mode === "planning") { from = weekStart(date); to = addDays(from, 13); prev = addDays(from, -14); next = addDays(from, 14); label = `${fmtDate(from)} – ${fmtDate(to, true)}`; }
  else if (mode === "timeline") { from = `${date.slice(0, 7)}-01`; const g = monthGrid(date.slice(0, 7)); to = addDays(`${monthGrid(monthGrid(g.next).next).next}-01`, -1); prev = `${g.prev}-01`; next = `${g.next}-01`; label = `Cronograma desde ${fmtDate(from, true)}`; }
  else { const g = monthGrid(date.slice(0, 7)); from = g.days[0]; to = g.days[41]; prev = `${g.prev}-01`; next = `${g.next}-01`; label = g.label; }

  const [tasks, events, projects, members] = await Promise.all([
    listTasks(ctx, sp.assignee ? { assigneeId: sp.assignee } : {}),
    listEvents(ctx, from, to),
    listProjects(ctx),
    visibleMembers(ctx),
  ]);
  const fTasks = tasks.filter((t) => !sp.project || t.project_id === sp.project);
  const fEvents = events.filter((e) => !sp.project || e.project_id === sp.project);
  const fProjects = projects.filter((p) => !sp.project || p.id === sp.project);
  const lb = linkBase(path, sp);
  const nav = (patch: Partial<SP>) => linkBase(path, { ...sp, ...patch, task: undefined }).replace(/[?&]$/, "");

  const items: Item[] = [
    ...fTasks.filter((t) => t.due_date).map((t): Item => ({ key: `t${t.id}`, date: t.due_date!, title: t.title, href: `${lb}task=${t.id}`, kind: "task", color: t.project_color, done: t.status === "done" })),
    ...fEvents.map((e): Item => ({ key: `e${e.id}`, date: tzDate(e.starts_at), title: e.title, kind: e.kind, color: e.project_color ?? "#7c3aed", ev: e,
      time: e.kind === "meeting" ? tzTime(e.starts_at) : undefined })),
    ...(sp.assignee ? [] : fProjects.filter((p) => p.end_date && p.status !== "completed").map((p): Item => ({ key: `p${p.id}`, date: p.end_date!, title: `Fin: ${p.name}`, href: `${base}/projects/${p.id}`, kind: "project_end", color: p.color }))),
  ];
  const itemsOn = (d: string) => items.filter((i) => i.date === d);
  const alerts = fTasks.filter((t) => t.status !== "done" && t.due_date && t.due_date >= today && t.due_date <= addDays(today, 3) && (!sp.assignee || t.assignee_id === sp.assignee));
  const editable = await sql<{ id: string; name: string }[]>`select id, name from projects where workspace_id = ${ctx.ws.id} and project_access_level(${ctx.user.id}, id) >= 2 order by name`;
  const canCreate = ctx.role !== "guest" || editable.length > 0;

  const modes = [["month", "Mes"], ["week", "Semana"], ["day", "Día"], ["planning", "Por responsable"], ["timeline", "Cronograma"]];

  return (
    <>
      <PageHeader title="Calendario y planificación" subtitle="Vencimientos, hitos, reuniones y cronograma."
        actions={canCreate && <Modal title="Programar reunión o hito" trigger="Nuevo evento"><EventForm action={createEvent} workspaceId={ctx.ws.id} projects={ctx.role === "guest" ? editable : projects.filter((p) => p.level >= 2).map((p) => ({ id: p.id, name: p.name }))} defaultDate={date} /></Modal>} />

      {alerts.length > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">
          <BellRing className="mt-0.5 h-4 w-4 shrink-0" />
          <span><b>Próximos vencimientos (3 días):</b> {alerts.slice(0, 5).map((t, i) => <span key={t.id}>{i > 0 && " · "}<Link href={`${lb}task=${t.id}`} scroll={false} className="underline">{t.title}</Link> ({fmtDate(t.due_date)})</span>)}{alerts.length > 5 && ` y ${alerts.length - 5} más`}</span>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 overflow-x-auto rounded-lg bg-ink-100 p-1">
          {modes.map(([k, l]) => <Link key={k} href={nav({ mode: k })} className={clsx("whitespace-nowrap rounded-md px-3 py-1 text-sm", mode === k ? "bg-white font-medium shadow-sm" : "text-ink-600")}>{l}</Link>)}
        </div>
        <div className="flex items-center gap-1">
          <Link href={nav({ date: prev })} className="btn-ghost p-1.5" aria-label="Anterior"><ChevronLeft className="h-4 w-4" /></Link>
          <Link href={nav({ date: today })} className="btn-secondary btn-sm">Hoy</Link>
          <Link href={nav({ date: next })} className="btn-ghost p-1.5" aria-label="Siguiente"><ChevronRight className="h-4 w-4" /></Link>
          <span className="ml-2 text-sm font-semibold capitalize">{label}</span>
        </div>
        <form className="ml-auto flex flex-wrap gap-2">
          <input type="hidden" name="mode" value={mode} /><input type="hidden" name="date" value={date} />
          <select name="assignee" defaultValue={sp.assignee ?? ""} className="input w-auto py-1.5" aria-label="Responsable"><option value="">Todas las personas</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          <select name="project" defaultValue={sp.project ?? ""} className="input w-auto py-1.5" aria-label="Proyecto"><option value="">Todos los proyectos</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <button className="btn-secondary py-1.5">Aplicar</button>
        </form>
      </div>

      {mode === "month" && (
        <div className="card overflow-hidden">
          <div className="grid grid-cols-7 border-b border-ink-100 bg-ink-50 text-center text-[11px] font-medium uppercase text-ink-500">{WD.map((d) => <div key={d} className="py-2">{d}</div>)}</div>
          <div className="grid grid-cols-7">
            {monthGrid(date.slice(0, 7)).days.map((d) => (
              <div key={d} className={clsx("min-h-[80px] border-b border-r border-ink-100 p-1 sm:min-h-[110px]", d.slice(0, 7) !== date.slice(0, 7) && "bg-ink-50/60")}>
                <Link href={nav({ mode: "day", date: d })} className={clsx("mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs hover:bg-ink-100", d === today ? "bg-brand-600 font-semibold text-white hover:bg-brand-700" : "text-ink-500")}>{Number(d.slice(8))}</Link>
                <div className="space-y-0.5">{itemsOn(d).slice(0, 3).map((i) => <Chip key={i.key} i={i} />)}{itemsOn(d).length > 3 && <Link href={nav({ mode: "day", date: d })} className="block px-1 text-[10px] text-ink-500 hover:underline">+{itemsOn(d).length - 3} más</Link>}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {mode === "week" && (
        <div className="grid gap-3 md:grid-cols-7">
          {Array.from({ length: 7 }, (_, k) => addDays(from, k)).map((d, k) => (
            <div key={d} className={clsx("card min-h-[160px] p-2", d === today && "ring-2 ring-brand-300")}>
              <Link href={nav({ mode: "day", date: d })} className="mb-2 block text-xs font-semibold text-ink-500 hover:underline">{WD[k]} {Number(d.slice(8))}</Link>
              <div className="space-y-1">{itemsOn(d).sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "")).map((i) => <Chip key={i.key} i={i} big />)}</div>
            </div>
          ))}
        </div>
      )}

      {mode === "day" && (
        <div className="card p-5">
          {itemsOn(date).length === 0 ? <p className="text-sm text-ink-500">No hay elementos para este día.</p> : (
            <ul className="divide-y divide-ink-100">
              {itemsOn(date).sort((a, b) => (a.time ?? "00").localeCompare(b.time ?? "00")).map((i) => (
                <li key={i.key} className="flex items-center gap-3 py-3">
                  <span className="w-14 text-xs font-medium text-ink-500">{i.time ?? (i.kind === "task" ? "Vence" : "Todo el día")}</span>
                  <span className="h-8 w-1 rounded-full" style={{ background: i.color }} />
                  <span className="flex-1 text-sm">{kindIcon(i.kind)} {i.href ? <Link href={i.href} scroll={false} className="hover:underline">{i.title}</Link> : i.title}
                    {i.ev?.project_name && <span className="block text-xs text-ink-500">{i.ev.project_name}{i.ev.description && ` · ${i.ev.description}`}</span>}</span>
                  {i.ev && (ctx.role === "admin" || i.ev.created_by === ctx.user.id) && (
                    <ActionButton action={deleteEvent} hidden={{ workspaceId: ctx.ws.id, eventId: i.ev.id }} confirm="¿Eliminar este evento?" title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></ActionButton>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {mode === "planning" && <Planning from={from} members={sp.assignee ? members.filter((m) => m.id === sp.assignee) : members} tasks={fTasks} lb={lb} today={today} />}
      {mode === "timeline" && <Timeline from={from} to={to} projects={fProjects} tasks={fTasks} base={base} lb={lb} today={today} />}
      {sp.task && <TaskDrawer ctx={ctx} taskId={sp.task} closeHref={lb.replace(/[?&]$/, "")} base={base} />}
    </>
  );
}

function kindIcon(k: Item["kind"]) {
  return k === "meeting" ? "📅" : k === "milestone" ? "🏁" : k === "project_end" ? "🎯" : "";
}

function Chip({ i, big }: { i: Item; big?: boolean }) {
  const cls = clsx("flex items-center gap-1 truncate rounded px-1 py-0.5", big ? "text-xs" : "text-[10px] sm:text-[11px]", i.done && "line-through opacity-60");
  const body = (<><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: i.color }} />{i.time && <span className="text-ink-500">{i.time}</span>}{kindIcon(i.kind)}<span className="truncate">{i.title}</span></>);
  return i.href ? <Link href={i.href} scroll={false} title={i.title} className={clsx(cls, "bg-ink-50 hover:bg-ink-100")}>{body}</Link>
    : <span title={i.title} className={clsx(cls, "bg-violet-50")}>{body}</span>;
}

function Planning({ from, members, tasks, lb, today }: { from: string; members: { id: string; name: string; avatar_color: string }[]; tasks: TaskItem[]; lb: string; today: string }) {
  const days = Array.from({ length: 14 }, (_, k) => addDays(from, k));
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-xs">
        <thead><tr className="bg-ink-50"><th className="sticky left-0 z-10 w-44 bg-ink-50 p-2 text-left font-medium text-ink-500">Responsable</th>
          {days.map((d) => <th key={d} className={clsx("p-2 font-medium", d === today ? "text-brand-700" : "text-ink-500")}>{WD[(new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7]}<br />{Number(d.slice(8))}</th>)}</tr></thead>
        <tbody>
          {members.map((m) => {
            const mine = tasks.filter((t) => t.assignee_id === m.id && t.due_date);
            return (
              <tr key={m.id} className="border-t border-ink-100 align-top">
                <td className="sticky left-0 z-10 bg-white p-2"><span className="flex items-center gap-2"><Avatar name={m.name} color={m.avatar_color} size={22} /><span className="truncate font-medium">{m.name}</span></span></td>
                {days.map((d) => (
                  <td key={d} className={clsx("min-w-[70px] border-l border-ink-100 p-1", d === today && "bg-brand-50/50")}>
                    {mine.filter((t) => t.due_date === d).map((t) => (
                      <Link key={t.id} href={`${lb}task=${t.id}`} scroll={false} title={t.title} className={clsx("mb-0.5 block truncate rounded px-1 py-0.5", STATUS_STYLE[t.status].badge)}>{t.title}</Link>
                    ))}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Timeline({ from, to, projects, tasks, base, lb, today }: { from: string; to: string; projects: Awaited<ReturnType<typeof listProjects>>; tasks: TaskItem[]; base: string; lb: string; today: string }) {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const span = (new Date(`${to}T00:00:00Z`).getTime() - start) / DAY + 1;
  const pos = (s: string | null, e: string | null) => {
    const a = s ? (new Date(`${s}T00:00:00Z`).getTime() - start) / DAY : 0;
    const b = e ? (new Date(`${e}T00:00:00Z`).getTime() - start) / DAY + 1 : span;
    const l = Math.max(0, a), r = Math.min(span, b);
    return r <= l ? null : { left: `${(l / span) * 100}%`, width: `${((r - l) / span) * 100}%` };
  };
  const months: { label: string; left: string }[] = [];
  for (let d = from; d <= to; d = `${monthGrid(d.slice(0, 7)).next}-01`) months.push({ label: monthGrid(d.slice(0, 7)).label, left: `${((new Date(`${d}T00:00:00Z`).getTime() - start) / DAY / span) * 100}%` });
  const todayPos = pos(today, today);
  const rows = projects.filter((p) => p.start_date || p.end_date);
  return (
    <div className="card overflow-x-auto p-4">
      <div className="min-w-[760px]">
        <div className="relative ml-48 h-6 border-b border-ink-100 text-xs text-ink-500">{months.map((m) => <span key={m.label} className="absolute top-0 border-l border-ink-200 pl-1" style={{ left: m.left }}>{m.label}</span>)}</div>
        {rows.length === 0 && <p className="py-6 text-sm text-ink-500">Define fechas de inicio y fin en los proyectos para verlos en el cronograma.</p>}
        {rows.map((p) => {
          const bar = pos(p.start_date ?? p.end_date, p.end_date ?? p.start_date);
          const ts = tasks.filter((t) => t.project_id === p.id && !t.parent_id && (t.start_date || t.due_date));
          return (
            <div key={p.id} className="border-b border-ink-50 py-1">
              <div className="flex items-center">
                <Link href={`${base}/projects/${p.id}`} className="w-48 shrink-0 truncate pr-2 text-sm font-medium hover:underline">{p.name}</Link>
                <div className="relative h-6 flex-1">
                  {todayPos && <span className="absolute inset-y-0 w-px bg-rose-400" style={{ left: todayPos.left }} />}
                  {bar && <span className="absolute top-1 h-4 rounded-md opacity-90" style={{ ...bar, background: p.color }} title={`${p.start_date ?? ""} → ${p.end_date ?? ""}`} />}
                </div>
              </div>
              {ts.map((t) => {
                const b = pos(t.start_date ?? t.due_date, t.due_date ?? t.start_date);
                return (
                  <div key={t.id} className="flex items-center">
                    <Link href={`${lb}task=${t.id}`} scroll={false} className="w-48 shrink-0 truncate pl-4 pr-2 text-xs text-ink-600 hover:underline">{t.title}</Link>
                    <div className="relative h-5 flex-1">{b && <span className={clsx("absolute top-1 h-3 rounded", STATUS_STYLE[t.status].dot)} style={b} title={t.title} />}</div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
