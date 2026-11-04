import Link from "next/link";
import clsx from "clsx";
import { FolderKanban, Lock } from "lucide-react";
import { canCreateProjects, getWsContext } from "@/lib/access";
import { listProjects } from "@/lib/queries";
import { sql } from "@/lib/db";
import { Avatar, EmptyState, PageHeader, PriorityBadge, Progress, ProjectStatusBadge, fmtDate, percent } from "@/components/ui";
import { PROJECT_STATUS_LABEL, type ProjectStatus } from "@/lib/labels";

export const metadata = { title: "Proyectos" };

export default async function ProjectsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ status?: string; category?: string; team?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getWsContext(slug);
  const base = `/w/${slug}`;
  const all = await listProjects(ctx);
  const teams = ctx.role === "guest" ? [] : await sql<{ id: string; name: string }[]>`select id, name from teams where workspace_id = ${ctx.ws.id} order by name`;
  const categories = [...new Set(all.map((p) => p.category).filter(Boolean))].sort();
  const status = sp.status ?? "open";
  const projects = all.filter((p) =>
    (status === "all" || (status === "open" ? ["active", "on_hold"].includes(p.status) : p.status === status)) &&
    (!sp.category || p.category === sp.category) && (!sp.team || p.team_id === sp.team));
  const qs = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `?${q.toString()}`;
  };
  const statusTabs: [string, string][] = [["open", "Abiertos"], ...(["active", "on_hold", "completed", "archived"] as ProjectStatus[]).map((s) => [s, PROJECT_STATUS_LABEL[s]] as [string, string]), ["all", "Todos"]];

  return (
    <>
      <PageHeader title="Proyectos" subtitle={`${all.length} proyecto(s) visibles para ti`}
        actions={canCreateProjects(ctx.role) && <Link href={`${base}/projects/new`} className="btn-primary">Nuevo proyecto</Link>} />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 overflow-x-auto rounded-lg bg-ink-100 p-1">
          {statusTabs.map(([k, l]) => (
            <Link key={k} href={qs({ status: k })} className={clsx("whitespace-nowrap rounded-md px-3 py-1 text-sm", status === k ? "bg-white font-medium shadow-sm" : "text-ink-600")}>{l}</Link>
          ))}
        </div>
        <form className="flex flex-wrap gap-2">
          <input type="hidden" name="status" value={status} />
          {categories.length > 0 && (
            <select name="category" defaultValue={sp.category ?? ""} className="input w-auto py-1.5">
              <option value="">Todas las áreas</option>{categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          )}
          {teams.length > 0 && (
            <select name="team" defaultValue={sp.team ?? ""} className="input w-auto py-1.5">
              <option value="">Todos los equipos</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          {(categories.length > 0 || teams.length > 0) && <button className="btn-secondary py-1.5">Filtrar</button>}
        </form>
      </div>

      {projects.length === 0 ? (
        <EmptyState icon={<FolderKanban className="h-8 w-8" />} title="No hay proyectos aquí" text={ctx.role === "guest" ? "Cuando alguien comparta un proyecto contigo aparecerá aquí." : "Crea tu primer proyecto para organizar tareas y responsables."}>
          {canCreateProjects(ctx.role) && <Link href={`${base}/projects/new`} className="btn-primary">Crear proyecto</Link>}
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const pct = percent(p.done, p.total);
            return (
              <Link key={p.id} href={`${base}/projects/${p.id}`} className="card group flex flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold text-white" style={{ background: p.color }}>{p.name[0]?.toUpperCase()}</span>
                  <div className="flex items-center gap-1.5">{p.visibility === "private" && <Lock className="h-3.5 w-3.5 text-ink-400" />}<ProjectStatusBadge status={p.status} /></div>
                </div>
                <h3 className="mt-3 font-semibold text-ink-900 group-hover:text-brand-700">{p.name}</h3>
                <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm text-ink-500">{p.description || "Sin descripción"}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <PriorityBadge priority={p.priority} />
                  {p.category && <span className="chip bg-ink-100 text-ink-600">{p.category}</span>}
                  {p.team_name && <span className="chip bg-violet-50 text-violet-700">{p.team_name}</span>}
                </div>
                <div className="mt-4 flex items-center gap-3"><Progress value={pct} color={p.color} /><span className="text-xs font-medium tabular-nums text-ink-600">{pct}%</span></div>
                <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3 text-xs text-ink-500">
                  <span className="flex items-center gap-2"><Avatar name={p.owner_name} color={p.owner_color} size={22} />{p.owner_name ?? "Sin responsable"}</span>
                  <span>{p.end_date ? `Fin: ${fmtDate(p.end_date, true)}` : `${p.done}/${p.total} tareas`}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
