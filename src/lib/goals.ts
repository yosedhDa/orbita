import "server-only";
import { sql } from "./db";

export type GoalRow = {
  id: string; title: string; description: string; metric_type: "manual" | "project_progress" | "tasks_completed";
  target_value: number; unit: string; start_date: string | null; due_date: string | null; owner_id: string | null;
  owner_name: string | null; owner_color: string | null; team_id: string | null; team_name: string | null;
  current: number; project_ids: string[]; projects: { id: string; name: string; color: string }[];
};
export type GoalHealth = "achieved" | "on_track" | "at_risk" | "off_track";

/** Objetivos del espacio con su valor actual calculado según el tipo de métrica. */
export async function listGoals(wsId: string, userId: string, teamId?: string): Promise<GoalRow[]> {
  const rows = await sql<(Omit<GoalRow, "current" | "target_value"> & { current: string; target_value: string })[]>`
    select g.id, g.title, g.description, g.metric_type, g.target_value, g.unit,
      to_char(g.start_date, 'YYYY-MM-DD') as start_date, to_char(g.due_date, 'YYYY-MM-DD') as due_date,
      g.owner_id, u.name as owner_name, u.avatar_color as owner_color, g.team_id, t.name as team_name,
      coalesce((select array_agg(gp.project_id) from goal_projects gp where gp.goal_id = g.id), '{}') as project_ids,
      coalesce((select json_agg(json_build_object('id', p.id, 'name', p.name, 'color', p.color) order by p.name)
        from goal_projects gp join projects p on p.id = gp.project_id
        where gp.goal_id = g.id and project_access_level(${userId}, p.id) >= 1), '[]') as projects,
      case g.metric_type
        when 'manual' then g.current_value
        when 'project_progress' then coalesce((
          select avg(case when x.total = 0 then 0 else 100.0 * x.done / x.total end) from (
            select (select count(*) from tasks k where k.project_id = gp.project_id and k.parent_id is null) as total,
                   (select count(*) from tasks k where k.project_id = gp.project_id and k.parent_id is null and k.status = 'done') as done
            from goal_projects gp where gp.goal_id = g.id) x), 0)
        else (select count(*) from tasks k join goal_projects gp on gp.project_id = k.project_id and gp.goal_id = g.id
              where k.status = 'done' and k.completed_at is not null
                and (g.start_date is null or k.completed_at >= g.start_date)
                and (g.due_date is null or k.completed_at < g.due_date + 1))
      end as current
    from goals g left join users u on u.id = g.owner_id left join teams t on t.id = g.team_id
    where g.workspace_id = ${wsId} ${teamId ? sql`and g.team_id = ${teamId}` : sql``}
    order by g.due_date nulls last, g.created_at`;
  return rows.map((r) => ({ ...r, current: Math.round(Number(r.current) * 10) / 10, target_value: Number(r.target_value) }));
}

/** Salud del objetivo: compara el avance real con el esperado según el tiempo transcurrido. */
export function goalHealth(g: Pick<GoalRow, "current" | "target_value" | "start_date" | "due_date">, today: string): { health: GoalHealth; pct: number; expected: number | null } {
  const pct = Math.min(100, Math.round((g.current / g.target_value) * 100));
  if (g.current >= g.target_value) return { health: "achieved", pct: 100, expected: null };
  if (!g.due_date) return { health: pct > 0 ? "on_track" : "at_risk", pct, expected: null };
  const day = (s: string) => new Date(`${s}T00:00:00Z`).getTime();
  const start = g.start_date ? day(g.start_date) : null;
  const end = day(g.due_date);
  const now = day(today);
  if (now > end) return { health: "off_track", pct, expected: 100 };
  const expected = start && end > start ? Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100)) : null;
  if (expected === null) return { health: "on_track", pct, expected };
  const ratio = expected === 0 ? 1 : pct / expected;
  return { health: ratio >= 0.9 ? "on_track" : ratio >= 0.6 ? "at_risk" : "off_track", pct, expected: Math.round(expected) };
}

export const HEALTH_LABEL: Record<GoalHealth, string> = { achieved: "Logrado", on_track: "En camino", at_risk: "En riesgo", off_track: "Atrasado" };
export const HEALTH_STYLE: Record<GoalHealth, string> = {
  achieved: "bg-emerald-50 text-emerald-700", on_track: "bg-blue-50 text-blue-700", at_risk: "bg-amber-50 text-amber-700", off_track: "bg-rose-50 text-rose-700",
};
export const HEALTH_HEX: Record<GoalHealth, string> = { achieved: "#10b981", on_track: "#3b66f0", at_risk: "#f59e0b", off_track: "#e11d48" };
