import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { getWsContext } from "@/lib/access";
import { sql } from "@/lib/db";
import { productivityReport, projectHealth } from "@/lib/reports";
import { Avatar, PageHeader, Progress, fmtDate, percent, todayStr, tzDate } from "@/components/ui";
import { Columns } from "@/components/charts";
import { PrintButton } from "@/components/PrintButton";

export const metadata = { title: "Reportes" };
const HEALTH = { on_track: ["En tiempo", "bg-emerald-50 text-emerald-700"], at_risk: ["En riesgo", "bg-amber-50 text-amber-700"], off_track: ["Atrasado", "bg-rose-50 text-rose-700"] } as const;
const days = (n: number | null) => (n === null ? "—" : n < 1 ? `${Math.round(n * 24)} h` : `${n.toFixed(1)} d`);

export default async function ReportsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ from?: string; to?: string; team?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getWsContext(slug);
  if (ctx.role === "guest") notFound();
  const today = todayStr();
  const valid = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
  const to = valid(sp.to) ?? today;
  const from = valid(sp.from) ?? tzDate(new Date(new Date(`${to}T12:00:00Z`).getTime() - 29 * 864e5));
  const teams = await sql<{ id: string; name: string }[]>`select id, name from teams where workspace_id = ${ctx.ws.id} order by name`;
  const team = teams.find((t) => t.id === sp.team)?.id;
  const r = await productivityReport(ctx.ws.id, ctx.user.id, from, to, team);
  const s = r.summary;
  const onTime = s.with_due ? percent(s.on_time, s.with_due) : null;
  const q = new URLSearchParams({ from, to, ...(team ? { team } : {}) }).toString();
  const presets: [string, number][] = [["7 días", 6], ["30 días", 29], ["90 días", 89]];

  return (
    <div className="report">
      <PageHeader title="Reportes de productividad" subtitle={`${fmtDate(from, true)} – ${fmtDate(to, true)}${team ? ` · equipo ${teams.find((t) => t.id === team)?.name}` : ""} · ${ctx.ws.name}`}
        actions={<><a href={`/api/export?ws=${ctx.ws.id}&type=report&${q}`} className="btn-secondary no-print"><Download className="h-4 w-4" />CSV (Excel)</a><PrintButton /></>} />

      <form className="no-print mb-6 flex flex-wrap items-end gap-2">
        <div><label className="label" htmlFor="r-from">Desde</label><input id="r-from" type="date" name="from" defaultValue={from} className="input py-1.5" /></div>
        <div><label className="label" htmlFor="r-to">Hasta</label><input id="r-to" type="date" name="to" defaultValue={to} className="input py-1.5" /></div>
        {teams.length > 0 && <div><label className="label" htmlFor="r-team">Equipo</label>
          <select id="r-team" name="team" defaultValue={team ?? ""} className="input py-1.5"><option value="">Todos</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>}
        <button className="btn-primary py-1.5">Aplicar</button>
        {presets.map(([l, n]) => <Link key={l} className="btn-ghost btn-sm" href={`?from=${tzDate(new Date(Date.now() - n * 864e5))}&to=${today}${team ? `&team=${team}` : ""}`}>{l}</Link>)}
      </form>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["Tareas creadas", s.created], ["Tareas completadas", s.completed], ["Cumplimiento en fecha", onTime === null ? "—" : `${onTime}%`],
          ["Vencidas abiertas (hoy)", s.overdue], ["Tiempo medio de ciclo", days(s.avg_cycle)],
        ].map(([l, v]) => (
          <div key={l as string} className="card p-4"><p className="text-2xl font-semibold tabular-nums" data-testid={`rep-${l}`}>{v}</p><p className="text-xs text-ink-500">{l}</p></div>
        ))}
      </div>

      <section className="card mt-6 p-5">
        <h2 className="mb-1 font-semibold">Ritmo semanal</h2>
        <p className="mb-4 text-xs text-ink-500">Tareas creadas (gris) frente a completadas (verde) por semana.</p>
        <div className="grid gap-6 md:grid-cols-2">
          <div><p className="mb-1 text-xs font-medium text-ink-500">Creadas</p><Columns data={r.weekly.map((w) => ({ label: w.wk, value: w.created }))} color="#94a3b8" height={90} /></div>
          <div><p className="mb-1 text-xs font-medium text-ink-500">Completadas</p><Columns data={r.weekly.map((w) => ({ label: w.wk, value: w.completed }))} color="#10b981" height={90} /></div>
        </div>
      </section>

      <section className="card mt-6 overflow-x-auto p-5">
        <h2 className="mb-4 font-semibold">Productividad por persona</h2>
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="border-b border-ink-100 text-left text-xs text-ink-500">
            <th className="py-2 font-medium">Persona</th><th className="py-2 text-right font-medium">Completadas</th><th className="py-2 text-right font-medium">En fecha</th>
            <th className="py-2 text-right font-medium">Abiertas</th><th className="py-2 text-right font-medium">Vencidas</th><th className="py-2 text-right font-medium">Ciclo medio</th></tr></thead>
          <tbody className="divide-y divide-ink-50">
            {r.members.map((m) => (
              <tr key={m.id} data-report-member={m.name}>
                <td className="py-2"><span className="flex items-center gap-2"><Avatar name={m.name} color={m.avatar_color} size={22} />{m.name}</span></td>
                <td className="py-2 text-right font-medium tabular-nums">{m.completed}</td>
                <td className="py-2 text-right tabular-nums">{m.with_due ? `${percent(m.on_time, m.with_due)}%` : "—"}</td>
                <td className="py-2 text-right tabular-nums">{m.open}</td>
                <td className={`py-2 text-right tabular-nums ${m.overdue ? "font-medium text-rose-600" : ""}`}>{m.overdue}</td>
                <td className="py-2 text-right tabular-nums">{days(m.avg_cycle)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-4 font-semibold">Cumplimiento por equipo</h2>
          {r.teams.length === 0 ? <p className="text-sm text-ink-500">No hay equipos.</p> : (
            <ul className="space-y-4">
              {r.teams.map((t) => {
                const pct = t.with_due ? percent(t.on_time, t.with_due) : null;
                return (
                  <li key={t.id}>
                    <div className="mb-1 flex items-center justify-between text-sm"><span className="flex items-center gap-2 font-medium"><span className="h-2.5 w-2.5 rounded" style={{ background: t.color }} />{t.name}</span>
                      <span className="text-xs text-ink-500">{t.completed} completadas · {t.open} abiertas{t.overdue > 0 && <span className="text-rose-600"> · {t.overdue} vencidas</span>}</span></div>
                    <div className="flex items-center gap-2"><Progress value={pct ?? 0} color={t.color} /><span className="w-24 text-right text-xs">{pct === null ? "sin fechas" : `${pct}% en fecha`}</span></div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="card p-5">
          <h2 className="mb-1 font-semibold">Salud de proyectos activos</h2>
          <p className="mb-4 text-xs text-ink-500">Compara el avance con el tiempo transcurrido entre inicio y fin.</p>
          <ul className="space-y-3">
            {r.projects.map((p) => {
              const h = projectHealth(p, today);
              const [label, cls] = HEALTH[h.health as keyof typeof HEALTH];
              return (
                <li key={p.id} className="text-sm">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <Link href={`/w/${slug}/projects/${p.id}`} className="truncate font-medium hover:underline">{p.name}</Link>
                    <span className={`chip ${cls}`}>{label}</span>
                  </div>
                  <div className="flex items-center gap-2"><Progress value={h.progress} color={p.color} /><span className="w-40 text-right text-xs text-ink-500">{Math.round(h.progress)}% avance{h.elapsed !== null && ` · ${Math.round(h.elapsed)}% tiempo`}</span></div>
                  <p className="mt-0.5 text-[11px] text-ink-400">{p.completed_period} completadas en el periodo · {p.overdue} vencidas{p.end_date && ` · fin ${fmtDate(p.end_date, true)}`}</p>
                </li>
              );
            })}
            {r.projects.length === 0 && <li className="text-sm text-ink-500">No hay proyectos activos.</li>}
          </ul>
        </section>
      </div>
      <p className="mt-6 text-xs text-ink-400">Generado el {new Date().toLocaleString("es", { timeZone: process.env.APP_TIMEZONE || undefined })} por {ctx.user.name}. Sólo incluye proyectos a los que tienes acceso.</p>
    </div>
  );
}
