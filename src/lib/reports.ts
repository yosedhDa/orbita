import "server-only";
import { todayStr } from "@/components/ui";
import { sql } from "./db";

export type MemberStat = { id: string; name: string; avatar_color: string; open: number; completed: number; on_time: number; with_due: number; overdue: number; avg_cycle: number | null };
export type ProjectStat = { id: string; name: string; color: string; total: number; done: number; completed_period: number; overdue: number; start_date: string | null; end_date: string | null };

/** Métricas de productividad para un periodo [from, to] (fechas inclusive), sólo sobre tareas visibles para el usuario. */
export async function productivityReport(wsId: string, userId: string, from: string, to: string, teamId?: string) {
  const memberFilter = teamId ? sql`and wm.user_id in (select user_id from team_members where team_id = ${teamId})` : sql``;
  const visible = sql`t.workspace_id = ${wsId} and project_access_level(${userId}, t.project_id) >= 1`;
  const inPeriod = sql`t.completed_at >= ${from}::date and t.completed_at < ${to}::date + 1`;

  const [[summary], members, teams, projects, weekly] = await Promise.all([
    sql<{ created: number; completed: number; on_time: number; with_due: number; overdue: number; avg_cycle: string | null }[]>`
      select (select count(*) from tasks t where ${visible} and t.created_at >= ${from}::date and t.created_at < ${to}::date + 1
                ${teamId ? sql`and t.assignee_id in (select user_id from team_members where team_id = ${teamId})` : sql``})::int as created,
             count(*) filter (where ${inPeriod})::int as completed,
             count(*) filter (where ${inPeriod} and t.due_date is not null and t.completed_at::date <= t.due_date)::int as on_time,
             count(*) filter (where ${inPeriod} and t.due_date is not null)::int as with_due,
             count(*) filter (where t.status <> 'done' and t.due_date < ${todayStr()}::date)::int as overdue,
             avg(extract(epoch from (t.completed_at - t.created_at)) / 86400) filter (where ${inPeriod}) as avg_cycle
      from tasks t where ${visible} ${teamId ? sql`and t.assignee_id in (select user_id from team_members where team_id = ${teamId})` : sql``}`,
    sql<(Omit<MemberStat, "avg_cycle"> & { avg_cycle: string | null })[]>`
      select u.id, u.name, u.avatar_color,
        count(t.id) filter (where t.status <> 'done')::int as open,
        count(t.id) filter (where ${inPeriod})::int as completed,
        count(t.id) filter (where ${inPeriod} and t.due_date is not null and t.completed_at::date <= t.due_date)::int as on_time,
        count(t.id) filter (where ${inPeriod} and t.due_date is not null)::int as with_due,
        count(t.id) filter (where t.status <> 'done' and t.due_date < ${todayStr()}::date)::int as overdue,
        avg(extract(epoch from (t.completed_at - t.created_at)) / 86400) filter (where ${inPeriod}) as avg_cycle
      from workspace_members wm join users u on u.id = wm.user_id
      left join tasks t on t.assignee_id = u.id and ${visible}
      where wm.workspace_id = ${wsId} ${memberFilter}
      group by u.id order by count(t.id) filter (where ${inPeriod}) desc, u.name`,
    sql<{ id: string; name: string; color: string; members: number; completed: number; on_time: number; with_due: number; open: number; overdue: number }[]>`
      select tm_t.id, tm_t.name, tm_t.color,
        (select count(*) from team_members x where x.team_id = tm_t.id)::int as members,
        count(t.id) filter (where ${inPeriod})::int as completed,
        count(t.id) filter (where ${inPeriod} and t.due_date is not null and t.completed_at::date <= t.due_date)::int as on_time,
        count(t.id) filter (where ${inPeriod} and t.due_date is not null)::int as with_due,
        count(t.id) filter (where t.status <> 'done')::int as open,
        count(t.id) filter (where t.status <> 'done' and t.due_date < ${todayStr()}::date)::int as overdue
      from teams tm_t left join team_members tm on tm.team_id = tm_t.id
      left join tasks t on t.assignee_id = tm.user_id and ${visible}
      where tm_t.workspace_id = ${wsId} ${teamId ? sql`and tm_t.id = ${teamId}` : sql``}
      group by tm_t.id order by tm_t.name`,
    sql<ProjectStat[]>`
      select p.id, p.name, p.color, to_char(p.start_date, 'YYYY-MM-DD') as start_date, to_char(p.end_date, 'YYYY-MM-DD') as end_date,
        count(t.id) filter (where t.parent_id is null)::int as total,
        count(t.id) filter (where t.parent_id is null and t.status = 'done')::int as done,
        count(t.id) filter (where ${inPeriod})::int as completed_period,
        count(t.id) filter (where t.status <> 'done' and t.due_date < ${todayStr()}::date)::int as overdue
      from projects p left join tasks t on t.project_id = p.id
      where p.workspace_id = ${wsId} and p.status in ('active', 'on_hold') and project_access_level(${userId}, p.id) >= 1
        ${teamId ? sql`and p.team_id = ${teamId}` : sql``}
      group by p.id order by p.name`,
    sql<{ wk: string; created: number; completed: number }[]>`
      select to_char(w.wk, 'DD/MM') as wk,
        (select count(*) from tasks t where ${visible} and t.created_at >= w.wk and t.created_at < w.wk + interval '1 week')::int as created,
        (select count(*) from tasks t where ${visible} and t.completed_at >= w.wk and t.completed_at < w.wk + interval '1 week')::int as completed
      from generate_series(date_trunc('week', ${from}::date), date_trunc('week', ${to}::date), interval '1 week') as w(wk) order by w.wk`,
  ]);
  return {
    summary: { ...summary, avg_cycle: summary.avg_cycle === null ? null : Number(summary.avg_cycle) },
    members: members.map((m) => ({ ...m, avg_cycle: m.avg_cycle === null ? null : Number(m.avg_cycle) })) as MemberStat[],
    teams, projects, weekly,
  };
}

/** Salud de un proyecto: avance real frente al tiempo transcurrido. */
export function projectHealth(p: ProjectStat, today: string) {
  const progress = p.total ? (p.done / p.total) * 100 : 0;
  if (!p.start_date || !p.end_date) return { progress, elapsed: null as number | null, health: p.overdue > 0 ? "at_risk" : "on_track" };
  const d = (s: string) => new Date(`${s}T00:00:00Z`).getTime();
  const elapsed = Math.max(0, Math.min(100, ((d(today) - d(p.start_date)) / Math.max(1, d(p.end_date) - d(p.start_date))) * 100));
  const health = today > p.end_date && progress < 100 ? "off_track" : progress + 20 < elapsed ? "at_risk" : "on_track";
  return { progress, elapsed, health };
}
