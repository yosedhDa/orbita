import Link from "next/link";
import { notFound } from "next/navigation";
import { Target } from "lucide-react";
import { getWsContext } from "@/lib/access";
import { sql } from "@/lib/db";
import { listMembers } from "@/lib/queries";
import { goalHealth, listGoals, HEALTH_HEX, HEALTH_LABEL, HEALTH_STYLE, type GoalHealth } from "@/lib/goals";
import { addGoalUpdate, deleteGoal } from "@/actions/stage3";
import { GoalDialog } from "@/components/GoalForm";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms";
import { Avatar, EmptyState, PageHeader, Progress, fmtDate, timeAgo, todayStr } from "@/components/ui";

export const metadata = { title: "Objetivos y KPI" };
const METRIC_LABEL = { manual: "KPI manual", project_progress: "Avance de proyectos", tasks_completed: "Tareas completadas" };

export default async function GoalsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ team?: string }> }) {
  const { slug } = await params;
  const { team } = await searchParams;
  const ctx = await getWsContext(slug);
  if (ctx.role === "guest") notFound();
  const manage = ctx.role === "admin" || ctx.role === "leader";
  const [goals, members, teams, projects] = await Promise.all([
    listGoals(ctx.ws.id, ctx.user.id, team || undefined),
    listMembers(ctx.ws.id),
    sql<{ id: string; name: string }[]>`select id, name from teams where workspace_id = ${ctx.ws.id} order by name`,
    sql<{ id: string; name: string }[]>`select id, name from projects where workspace_id = ${ctx.ws.id} and project_access_level(${ctx.user.id}, id) >= 1 order by name`,
  ]);
  const updates = goals.length ? await sql<{ goal_id: string; value: string | null; note: string; created_at: Date; author: string | null }[]>`
    select gu.goal_id, gu.value, gu.note, gu.created_at, u.name as author from goal_updates gu left join users u on u.id = gu.author_id
    where gu.goal_id in ${sql(goals.map((g) => g.id))} order by gu.created_at desc` : [];
  const today = todayStr();
  const enriched = goals.map((g) => ({ ...g, ...goalHealth(g, today) }));
  const count = (h: GoalHealth) => enriched.filter((g) => g.health === h).length;
  const people = members.filter((m) => m.role !== "guest").map((m) => ({ id: m.id, name: m.name }));

  return (
    <>
      <PageHeader title="Objetivos y KPI" subtitle="Metas medibles, vinculadas a proyectos y equipos."
        actions={manage && <GoalDialog title="Nuevo objetivo" trigger="Nuevo objetivo" workspaceId={ctx.ws.id} members={people} teams={teams} projects={projects} />} />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {(["on_track", "at_risk", "off_track", "achieved"] as GoalHealth[]).map((h) => (
          <div key={h} className="card flex items-center gap-3 p-4">
            <span className="h-9 w-1.5 rounded-full" style={{ background: HEALTH_HEX[h] }} />
            <span><span className="block text-2xl font-semibold" data-testid={`goals-${h}`}>{count(h)}</span><span className="text-xs text-ink-500">{HEALTH_LABEL[h]}</span></span>
          </div>
        ))}
      </div>
      {teams.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Link href="?" className={`chip px-3 py-1 text-xs ${!team ? "bg-ink-900 text-white" : "bg-white ring-1 ring-ink-200"}`}>Todos los equipos</Link>
          {teams.map((t) => <Link key={t.id} href={`?team=${t.id}`} className={`chip px-3 py-1 text-xs ${team === t.id ? "bg-ink-900 text-white" : "bg-white ring-1 ring-ink-200"}`}>{t.name}</Link>)}
        </div>
      )}

      {enriched.length === 0 ? (
        <EmptyState icon={<Target className="h-8 w-8" />} title="Aún no hay objetivos" text={manage ? "Define metas medibles y vincúlalas a proyectos para seguir su cumplimiento automáticamente." : "Los administradores y líderes pueden definir objetivos."} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {enriched.map((g) => {
            const canUpdate = manage || g.owner_id === ctx.user.id;
            const mine = updates.filter((u) => u.goal_id === g.id).slice(0, 3);
            return (
              <article key={g.id} className="card p-5" data-goal={g.title}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold">{g.title}</h3>
                    <p className="mt-0.5 text-xs text-ink-500">{METRIC_LABEL[g.metric_type]}{g.team_name && ` · ${g.team_name}`}{g.due_date && ` · hasta el ${fmtDate(g.due_date, true)}`}</p>
                  </div>
                  <span className={`chip ${HEALTH_STYLE[g.health]}`} data-testid="goal-health">{HEALTH_LABEL[g.health]}</span>
                </div>
                {g.description && <p className="mt-2 text-sm text-ink-600">{g.description}</p>}
                <div className="mt-4 flex items-end justify-between">
                  <p><span className="text-2xl font-semibold tabular-nums" data-testid="goal-current">{g.current}</span><span className="text-sm text-ink-500"> / {g.target_value} {g.unit}</span></p>
                  <span className="text-sm font-medium">{g.pct}%</span>
                </div>
                <div className="relative mt-2">
                  <Progress value={g.pct} color={HEALTH_HEX[g.health]} className="h-2" />
                  {g.expected !== null && g.health !== "achieved" && <span className="absolute -top-1 h-4 w-0.5 bg-ink-500" style={{ left: `${g.expected}%` }} title={`Esperado hoy: ${g.expected}%`} />}
                </div>
                {g.expected !== null && g.health !== "achieved" && <p className="mt-1 text-[11px] text-ink-400">La marca indica el avance esperado a hoy ({g.expected}%).</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                  <Avatar name={g.owner_name} color={g.owner_color} size={20} />{g.owner_name ?? "Sin responsable"}
                  {g.projects.map((p) => <Link key={p.id} href={`/w/${slug}/projects/${p.id}`} className="chip bg-ink-100 text-ink-600 hover:underline"><span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />{p.name}</Link>)}
                </div>
                {mine.length > 0 && (
                  <ul className="mt-4 space-y-1.5 border-t border-ink-100 pt-3 text-xs text-ink-600">
                    {mine.map((u, i) => <li key={i}><b>{u.author ?? "—"}</b>{u.value !== null && ` → ${Number(u.value)} ${g.unit}`}{u.note && `: ${u.note}`} <span className="text-ink-400">· {timeAgo(u.created_at)}</span></li>)}
                  </ul>
                )}
                {canUpdate && (
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">
                    <ActionForm action={addGoalUpdate} hidden={{ workspaceId: ctx.ws.id, goalId: g.id }} resetOnSuccess className="flex flex-1 flex-wrap gap-2">
                      {g.metric_type === "manual" && <input name="value" type="number" step="any" min="0" required placeholder="Nuevo valor" className="input w-32 py-1.5" aria-label="Nuevo valor" />}
                      <input name="note" maxLength={1000} placeholder={g.metric_type === "manual" ? "Nota (opcional)" : "Nota de seguimiento"} required={g.metric_type !== "manual"} className="input min-w-[140px] flex-1 py-1.5" aria-label="Nota" />
                      <SubmitButton className="btn-secondary py-1.5">Registrar</SubmitButton>
                    </ActionForm>
                    {manage && (
                      <>
                        <GoalDialog title="Editar objetivo" trigger="Editar" triggerClassName="btn-ghost btn-sm" workspaceId={ctx.ws.id} members={people} teams={teams} projects={projects}
                          initial={{ id: g.id, title: g.title, description: g.description, owner_id: g.owner_id, team_id: g.team_id, metric_type: g.metric_type, target_value: g.target_value, unit: g.unit, start_date: g.start_date, due_date: g.due_date, project_ids: g.project_ids }} />
                        <ActionButton action={deleteGoal} hidden={{ workspaceId: ctx.ws.id, goalId: g.id }} confirm={`¿Eliminar el objetivo «${g.title}»?`} className="btn-ghost btn-sm text-rose-600">Eliminar</ActionButton>
                      </>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
