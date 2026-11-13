import { NextResponse, type NextRequest } from "next/server";
import { todayStr } from "@/components/ui";
import { sql } from "@/lib/db";
import { appUrl } from "@/lib/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Feed iCalendar (RFC 5545) por usuario, protegido por un token secreto revocable.
 * Se puede suscribir desde Google Calendar ("Otros calendarios → Desde URL"), Outlook o Apple Calendar.
 * Incluye: tareas con fecha límite asignadas al usuario (o todas las visibles con ?scope=all),
 * reuniones e hitos visibles y fin de proyectos visibles.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = raw.replace(/\.ics$/, "");
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return new NextResponse("No encontrado", { status: 404 });
  const [user] = await sql<{ id: string; name: string }[]>`select id, name from users where calendar_token = ${token}`;
  if (!user) return new NextResponse("No encontrado", { status: 404 });
  const all = req.nextUrl.searchParams.get("scope") === "all";
  const base = appUrl();

  const [tasks, events, projects] = await Promise.all([
    sql<{ id: string; title: string; due: string; status: string; project: string; slug: string; project_id: string; ws: string; description: string }[]>`
      select t.id, t.title, to_char(t.due_date, 'YYYYMMDD') as due, t.status, p.name as project, w.slug, t.project_id, w.name as ws, t.description
      from tasks t join projects p on p.id = t.project_id join workspaces w on w.id = t.workspace_id
      join workspace_members wm on wm.workspace_id = t.workspace_id and wm.user_id = ${user.id}
      where t.due_date is not null and t.due_date > ${todayStr()}::date - 90 and project_access_level(${user.id}, t.project_id) >= 1
        ${all ? sql`` : sql`and (t.assignee_id = ${user.id} or exists (select 1 from task_collaborators c where c.task_id = t.id and c.user_id = ${user.id}))`}
      limit 2000`,
    sql<{ id: string; title: string; kind: string; starts_at: Date; ends_at: Date | null; description: string; project: string | null; ws: string }[]>`
      select e.id, e.title, e.kind, e.starts_at, e.ends_at, e.description, p.name as project, w.name as ws
      from events e join workspaces w on w.id = e.workspace_id left join projects p on p.id = e.project_id
      join workspace_members wm on wm.workspace_id = e.workspace_id and wm.user_id = ${user.id}
      where e.starts_at > now() - interval '90 days'
        and (case when e.project_id is null then wm.role <> 'guest' else project_access_level(${user.id}, e.project_id) >= 1 end)
      limit 2000`,
    sql<{ id: string; name: string; end: string; slug: string }[]>`
      select p.id, p.name, to_char(p.end_date, 'YYYYMMDD') as end, w.slug from projects p join workspaces w on w.id = p.workspace_id
      join workspace_members wm on wm.workspace_id = p.workspace_id and wm.user_id = ${user.id}
      where p.end_date is not null and p.status in ('active', 'on_hold') and project_access_level(${user.id}, p.id) >= 1 limit 500`,
  ]);

  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const fold = (line: string) => {
    const out: string[] = [];
    let l = line;
    while (Buffer.byteLength(l) > 74) { let i = 74; while (Buffer.byteLength(l.slice(0, i)) > 74) i--; out.push(l.slice(0, i)); l = " " + l.slice(i); }
    out.push(l);
    return out.join("\r\n");
  };
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const nextDay = (ymd: string) => {
    const d = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8) + 1));
    return d.toISOString().slice(0, 10).replace(/-/g, "");
  };
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Orbita//Calendario//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(`Orbita · ${user.name}`)}`, "X-PUBLISHED-TTL:PT1H", "REFRESH-INTERVAL;VALUE=DURATION:PT1H"];
  for (const t of tasks) {
    lines.push("BEGIN:VEVENT", `UID:task-${t.id}@orbita`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${t.due}`, `DTEND;VALUE=DATE:${nextDay(t.due)}`,
      `SUMMARY:${esc(`${t.status === "done" ? "✓ " : "⏰ "}${t.title}`)}`,
      `DESCRIPTION:${esc(`${t.ws} · ${t.project}${t.description ? `\n\n${t.description.slice(0, 500)}` : ""}`)}`,
      `URL:${base}/w/${t.slug}/projects/${t.project_id}?task=${t.id}`, "TRANSP:TRANSPARENT", "END:VEVENT");
  }
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:event-${e.id}@orbita`, `DTSTAMP:${stamp}`);
    if (e.kind === "milestone") {
      const d = utc(new Date(e.starts_at)).slice(0, 8);
      lines.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${nextDay(d)}`, `SUMMARY:${esc(`🏁 ${e.title}`)}`);
    } else {
      lines.push(`DTSTART:${utc(new Date(e.starts_at))}`, `DTEND:${utc(new Date(e.ends_at ?? new Date(new Date(e.starts_at).getTime() + 3600e3)))}`, `SUMMARY:${esc(e.title)}`);
    }
    lines.push(`DESCRIPTION:${esc(`${e.ws}${e.project ? ` · ${e.project}` : ""}${e.description ? `\n\n${e.description}` : ""}`)}`, "END:VEVENT");
  }
  for (const p of projects) {
    lines.push("BEGIN:VEVENT", `UID:project-end-${p.id}@orbita`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${p.end}`, `DTEND;VALUE=DATE:${nextDay(p.end)}`,
      `SUMMARY:${esc(`🎯 Fin del proyecto: ${p.name}`)}`, `URL:${base}/w/${p.slug}/projects/${p.id}`, "TRANSP:TRANSPARENT", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return new NextResponse(lines.map(fold).join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="orbita.ics"', "Cache-Control": "private, max-age=300" },
  });
}
