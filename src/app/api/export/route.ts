import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { productivityReport } from "@/lib/reports";
import { PRIORITY_LABEL, PROJECT_STATUS_LABEL, STATUS_LABEL, type Priority, type ProjectStatus, type TaskStatus } from "@/lib/labels";

export const runtime = "nodejs";

function csv(rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // evita inyección de fórmulas en Excel
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

/** Exporta tareas o proyectos visibles para el usuario en CSV (compatible con Excel). */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("No autenticado", { status: 401 });
  const ws = req.nextUrl.searchParams.get("ws") ?? "";
  const type = req.nextUrl.searchParams.get("type");
  if (!/^[0-9a-f-]{36}$/.test(ws)) return new NextResponse("ws", { status: 400 });
  const [m] = await sql<{ role: string }[]>`select role from workspace_members where workspace_id = ${ws} and user_id = ${user.id}`;
  if (!m || (type === "report" && m.role === "guest")) return new NextResponse("Sin acceso", { status: 403 });

  let body: string;
  if (type === "report") {
    const d = (k: string) => { const v = req.nextUrl.searchParams.get(k) ?? ""; return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; };
    const from = d("from"), to = d("to");
    if (!from || !to) return new NextResponse("Periodo no válido", { status: 400 });
    const team = req.nextUrl.searchParams.get("team");
    const r = await productivityReport(ws, user.id, from, to, team && /^[0-9a-f-]{36}$/.test(team) ? team : undefined);
    body = csv([[`Reporte de productividad ${from} a ${to}`], [],
      ["Persona", "Completadas", "Con fecha límite", "Completadas en fecha", "Cumplimiento %", "Abiertas", "Vencidas", "Ciclo medio (días)"],
      ...r.members.map((m) => [m.name, m.completed, m.with_due, m.on_time, m.with_due ? Math.round((m.on_time / m.with_due) * 100) : null, m.open, m.overdue, m.avg_cycle === null ? null : Number(m.avg_cycle.toFixed(1))]),
      [], ["Equipo", "Integrantes", "Completadas", "Cumplimiento %", "Abiertas", "Vencidas"],
      ...r.teams.map((t) => [t.name, t.members, t.completed, t.with_due ? Math.round((t.on_time / t.with_due) * 100) : null, t.open, t.overdue]),
      [], ["Proyecto", "Tareas", "Completadas", "Avance %", "Completadas en el periodo", "Vencidas", "Fin"],
      ...r.projects.map((p) => [p.name, p.total, p.done, p.total ? Math.round((p.done / p.total) * 100) : 0, p.completed_period, p.overdue, p.end_date])]);
  } else if (type === "projects") {
    const rows = await sql<{ name: string; status: ProjectStatus; priority: Priority; category: string; owner: string | null; team: string | null; start_date: string | null; end_date: string | null; total: number; done: number }[]>`
      select p.name, p.status, p.priority, p.category, u.name as owner, t.name as team, to_char(p.start_date, 'YYYY-MM-DD') start_date, to_char(p.end_date, 'YYYY-MM-DD') end_date,
        (select count(*) from tasks x where x.project_id = p.id and x.parent_id is null)::int total,
        (select count(*) from tasks x where x.project_id = p.id and x.parent_id is null and x.status = 'done')::int done
      from projects p left join users u on u.id = p.owner_id left join teams t on t.id = p.team_id
      where p.workspace_id = ${ws} and project_access_level(${user.id}, p.id) >= 1 order by p.name`;
    body = csv([["Proyecto", "Estado", "Prioridad", "Área", "Responsable", "Equipo", "Inicio", "Fin", "Tareas", "Completadas", "Avance %"],
      ...rows.map((r) => [r.name, PROJECT_STATUS_LABEL[r.status], PRIORITY_LABEL[r.priority], r.category, r.owner, r.team, r.start_date, r.end_date, r.total, r.done, r.total ? Math.round((r.done / r.total) * 100) : 0])]);
  } else {
    const rows = await sql<{ title: string; project: string; status: TaskStatus; priority: Priority; assignee: string | null; due_date: string | null; created: string; completed: string | null; parent: string | null }[]>`
      select t.title, p.name as project, t.status, t.priority, u.name as assignee, to_char(t.due_date, 'YYYY-MM-DD') due_date,
        to_char(t.created_at, 'YYYY-MM-DD') created, to_char(t.completed_at, 'YYYY-MM-DD') completed, pt.title as parent
      from tasks t join projects p on p.id = t.project_id left join users u on u.id = t.assignee_id left join tasks pt on pt.id = t.parent_id
      where t.workspace_id = ${ws} and project_access_level(${user.id}, t.project_id) >= 1 order by p.name, t.created_at`;
    body = csv([["Tarea", "Proyecto", "Tarea principal", "Estado", "Prioridad", "Responsable", "Fecha límite", "Creada", "Completada"],
      ...rows.map((r) => [r.title, r.project, r.parent, STATUS_LABEL[r.status], PRIORITY_LABEL[r.priority], r.assignee, r.due_date, r.created, r.completed])]);
  }
  return new NextResponse(body, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="orbita-${type === "projects" ? "proyectos" : type === "report" ? "reporte" : "tareas"}.csv"`, "Cache-Control": "no-store" },
  });
}
