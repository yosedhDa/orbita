import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, FolderKanban, ListTodo, Loader, CalendarClock, Eye } from "lucide-react";
import { getWsContext } from "@/lib/access";
import { sql } from "@/lib/db";
import { listActivity, listProjects } from "@/lib/queries";
import { STATUS_LABEL, STATUS_STYLE, type TaskStatus } from "@/lib/labels";
import { Avatar, DueDate, EmptyState, PageHeader, Progress, ProjectStatusBadge, PriorityBadge, percent, timeAgo, fmtDate, todayStr } from "@/components/ui";
import { Columns, Donut } from "@/components/charts";
import { Workload, type WorkloadRow } from "@/components/Workload";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getWsContext(slug);
  const base = `/w/${slug}`;
  const uid = ctx.user.id;

  const [projects, [counts], upcoming, workload, weekly, activity, mine] = await Promise.all([
    listProjects(ctx),
    sql<Record<TaskStatus | "overdue" | "due_week", number>[]>`
      select count(*) filter (where status = 'pending')::int as pending,
             count(*) filter (where status = 'in_progress')::int as in_progress,
             count(*) filter (where status = 'in_review')::int as in_review,
             count(*) filter (where status = 'done')::int as done,
             count(*) filter (where status <> 'done' and due_date < current_date)::int as overdue,
             count(*) filter (where status <> 'done' and due_date between current_date and current_date + 7)::int as due_week
      from tasks t where t.workspace_id = ${ctx.ws.id} and project_access_level(${uid}, t.project_id) >= 1`,
    sql<{ kind: string; id: string; title: string; date: string; project_id: string; project_name: string; color: string; status: TaskStatus | null; priority: "high" | "medium" | "low" | null; assignee: string | null; assignee_color: string | null }[]>`
      (select 'task' as kind, t.id, t.title, to_char(t.due_date, 'YYYY-MM-DD') as date, t.project_id, p.name as project_name, p.color, t.status, t.priority, u.name as assignee, u.avatar_color as assignee_color
       from tasks t join projects p on p.id = t.project_id left join users u on u.id = t.assignee_id
       where t.workspace_id = ${ctx.ws.id} and t.status <> 'done' and t.due_date between current_date and current_date + 14
         and project_access_level(${uid}, t.project_id) >= 1)
      union all
      (select 'project', p.id, p.name, to_char(p.end_date, 'YYYY-MM-DD'), p.id, p.name, p.color, null, p.priority, null, null
       from projects p where p.workspace_id = ${ctx.ws.id} and p.status in ('active', 'on_hold') and p.end_date between current_date and current_date + 14
         and project_access_level(${uid}, p.id) >= 1)
      order by date limit 10`,
    sql<WorkloadRow[]>`
      select u.id, u.name, u.avatar_color,
        count(t.id) filter (where t.status = 'pending')::int as pending,
        count(t.id) filter (where t.status = 'in_progress')::int as in_progress,
        count(t.id) filter (where t.status = 'in_review')::int as in_review,
        count(t.id) filter (where t.status = 'done')::int as done,
        count(t.id) filter (where t.status <> 'done' and t.due_date < current_date)::int as overdue
      from workspace_members wm join users u on u.id = wm.user_id
      left join tasks t on t.assignee_id = u.id and t.workspace_id = ${ctx.ws.id} and project_access_level(${uid}, t.project_id) >= 1
      where wm.workspace_id = ${ctx.ws.id} ${ctx.role === "guest" ? sql`and u.id = ${uid}` : sql``}
      group by u.id order by count(t.id) filter (where t.status <> 'done') desc, u.name limit 8`,
    sql<{ wk: string; n: number }[]>`
      select to_char(w.wk, 'DD/MM') as wk, count(t.id)::int as n
      from generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') as w(wk)
      left join tasks t on t.completed_at >= w.wk and t.completed_at < w.wk + interval '1 week' and t.workspace_id = ${ctx.ws.id}
        and project_access_level(${uid}, t.project_id) >= 1
      group by w.wk order by w.wk`,
    listActivity(ctx, { limit: 8 }),
    sql<{ id: string; title: string; due_date: string | null; status: TaskStatus; project_id: string; project_name: string; priority: "high" | "medium" | "low" }[]>`
      select t.id, t.title, to_char(t.due_date, 'YYYY-MM-DD') as due_date, t.status, t.project_id, p.name as project_name, t.priority
      from tasks t join projects p on p.id = t.project_id
      where t.assignee_id = ${uid} and t.workspace_id = ${ctx.ws.id} and t.status <> 'done' and project_access_level(${uid}, t.project_id) >= 1
      order by t.due_date nulls last, t.priority limit 6`,
  ]);

  const active = projects.filter((p) => p.status === "active" || p.status === "on_hold");
  const completed = projects.filter((p) => p.status === "completed");
  const totalTasks = counts.pending + counts.in_progress + counts.in_review + counts.done;
  const overall = percent(counts.done, totalTasks);
  const lateProjects = active.filter((p) => p.end_date && p.end_date < todayStr());
  const myOverdue = mine.filter((t) => t.due_date && t.due_date < todayStr());

  const kpis = [
    { label: "Proyectos activos", value: active.length, icon: FolderKanban, tone: "text-brand-600 bg-brand-50", href: `${base}/projects` },
    { label: "Proyectos finalizados", value: completed.length, icon: CheckCircle2, tone: "text-emerald-600 bg-emerald-50", href: `${base}/projects?status=completed` },
    { label: "Tareas pendientes", value: counts.pending, icon: ListTodo, tone: "text-slate-600 bg-slate-100", href: `${base}/tasks?scope=all&status=pending` },
    { label: "En progreso", value: counts.in_progress, icon: Loader, tone: "text-blue-600 bg-blue-50", href: `${base}/tasks?scope=all&status=in_progress` },
    { label: "En revisión", value: counts.in_review, icon: Eye, tone: "text-amber-600 bg-amber-50", href: `${base}/tasks?scope=all&status=in_review` },
    { label: "Completadas", value: counts.done, icon: CheckCircle2, tone: "text-emerald-600 bg-emerald-50", href: `${base}/tasks?scope=all&status=done` },
    { label: "Vencidas", value: counts.overdue, icon: AlertTriangle, tone: "text-rose-600 bg-rose-50", href: `${base}/tasks?scope=all&due=overdue` },
    { label: "Vencen en 7 días", value: counts.due_week, icon: CalendarClock, tone: "text-orange-600 bg-orange-50", href: `${base}/calendar` },
  ];

  return (
    <>
      <PageHeader title={`Hola, ${ctx.user.name.split(" ")[0]}`} subtitle={`Resumen de ${ctx.ws.name}`}
        actions={ctx.role !== "guest" && <Link href={`${base}/projects/new`} className="btn-primary">Nuevo proyecto</Link>} />

      {(myOverdue.length > 0 || lateProjects.length > 0) && (
        <div className="mb-6 space-y-2">
          {myOverdue.length > 0 && (
            <div className="flex items-start gap-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Tienes <b>{myOverdue.length}</b> tarea(s) vencida(s): {myOverdue.slice(0, 3).map((t, i) => (
                <span key={t.id}>{i > 0 && ", "}<Link className="underline" href={`${base}/projects/${t.project_id}?task=${t.id}`}>{t.title}</Link></span>))}</span>
            </div>
          )}
          {lateProjects.length > 0 && (
            <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">
              <Clock className="mt-0.5 h-4 w-4 shrink-0" />
              <span><b>{lateProjects.length}</b> proyecto(s) superaron su fecha de finalización: {lateProjects.slice(0, 3).map((p, i) => (
                <span key={p.id}>{i > 0 && ", "}<Link className="underline" href={`${base}/projects/${p.id}`}>{p.name}</Link></span>))}</span>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map((k) => (
          <Link key={k.label} href={k.href} className="card flex items-center gap-3 p-4 transition hover:ring-brand-200">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${k.tone}`}><k.icon className="h-[18px] w-[18px]" /></span>
            <span className="min-w-0"><span className="block text-2xl font-semibold tabular-nums leading-tight" data-testid={`kpi-${k.label}`}>{k.value}</span><span className="block truncate text-xs text-ink-500">{k.label}</span></span>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Avance de proyectos</h2><span className="text-sm text-ink-500">General: <b className="text-ink-900">{overall}%</b></span></div>
          {active.length === 0 ? <EmptyState title="No hay proyectos activos" text="Crea un proyecto para empezar a darle seguimiento." /> : (
            <ul className="divide-y divide-ink-100">
              {active.slice(0, 7).map((p) => {
                const pct = percent(p.done, p.total);
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                    <Link href={`${base}/projects/${p.id}`} className="flex min-w-0 flex-1 items-center gap-2 font-medium hover:underline">
                      <span className="h-2.5 w-2.5 shrink-0 rounded" style={{ background: p.color }} /><span className="truncate">{p.name}</span>
                    </Link>
                    <ProjectStatusBadge status={p.status} />
                    <div className="flex w-full items-center gap-3 sm:w-56">
                      <Progress value={pct} color={p.color} />
                      <span className="w-10 text-right text-xs font-medium tabular-nums text-ink-600">{pct}%</span>
                    </div>
                    <span className="w-24 text-xs text-ink-500">{p.done}/{p.total} tareas</span>
                    {p.overdue > 0 && <span className="chip bg-rose-50 text-rose-700">{p.overdue} vencidas</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <h2 className="mb-4 font-semibold">Tareas por estado</h2>
          <Donut label="Distribución de tareas por estado" data={(["pending", "in_progress", "in_review", "done"] as TaskStatus[]).map((s) => ({ label: STATUS_LABEL[s], value: counts[s], color: STATUS_STYLE[s].hex }))} />
          <h3 className="mb-2 mt-6 text-sm font-medium text-ink-600">Tareas completadas por semana</h3>
          <Columns data={weekly.map((w) => ({ label: w.wk, value: w.n }))} color="#10b981" height={80} />
        </section>

        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Mis tareas</h2><Link href={`${base}/tasks`} className="text-sm text-brand-600 hover:underline">Ver todas</Link></div>
          {mine.length === 0 ? <p className="text-sm text-ink-500">No tienes tareas abiertas. 🎉</p> : (
            <ul className="space-y-2">
              {mine.map((t) => (
                <li key={t.id}><Link href={`${base}/projects/${t.project_id}?task=${t.id}`} className="flex items-center gap-2 rounded-lg p-2 hover:bg-ink-50">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_STYLE[t.status].dot}`} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm">{t.title}</span><span className="block truncate text-xs text-ink-400">{t.project_name}</span></span>
                  <PriorityBadge priority={t.priority} /><DueDate date={t.due_date} />
                </Link></li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <h2 className="mb-4 font-semibold">Próximos vencimientos</h2>
          {upcoming.length === 0 ? <p className="text-sm text-ink-500">Nada vence en los próximos 14 días.</p> : (
            <ul className="space-y-2">
              {upcoming.map((u) => (
                <li key={u.kind + u.id}>
                  <Link href={u.kind === "task" ? `${base}/projects/${u.project_id}?task=${u.id}` : `${base}/projects/${u.id}`} className="flex items-center gap-3 rounded-lg p-2 hover:bg-ink-50">
                    <span className="w-12 shrink-0 rounded-md bg-ink-50 py-1 text-center text-xs font-semibold text-ink-700">{fmtDate(u.date)}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm">{u.kind === "project" ? `🏁 Fin de proyecto: ${u.title}` : u.title}</span>
                      <span className="block truncate text-xs text-ink-400">{u.project_name}</span></span>
                    {u.assignee && <Avatar name={u.assignee} color={u.assignee_color} />}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <h2 className="mb-4 font-semibold">Carga de trabajo</h2>
          <Workload rows={workload} base={base} />
        </section>

        <section className="card p-5 lg:col-span-3">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Actividad reciente</h2><Link href={`${base}/activity`} className="text-sm text-brand-600 hover:underline">Centro de actividad</Link></div>
          {activity.length === 0 ? <p className="text-sm text-ink-500">Sin actividad todavía.</p> : (
            <ul className="space-y-3">
              {activity.map((a) => (
                <li key={a.id} className="flex items-start gap-3 text-sm">
                  <Avatar name={a.actor_name} color={a.actor_color} size={26} />
                  <p className="min-w-0 flex-1"><b className="font-medium">{a.actor_name ?? "Alguien"}</b> <span className="text-ink-600">{a.summary}</span></p>
                  <span className="shrink-0 text-xs text-ink-400">{timeAgo(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
