import Link from "next/link";
import { getWsContext } from "@/lib/access";
import { sql } from "@/lib/db";
import { PageHeader, StatusBadge } from "@/components/ui";
import type { TaskStatus } from "@/lib/labels";

export const metadata = { title: "Búsqueda" };

export default async function SearchPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string }> }) {
  const { slug } = await params;
  const { q = "" } = await searchParams;
  const ctx = await getWsContext(slug);
  const base = `/w/${slug}`;
  const term = q.trim().slice(0, 100);
  const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const [projects, tasks, docs] = term.length < 2 ? [[], [], []] : await Promise.all([
    sql<{ id: string; name: string; color: string; description: string }[]>`select id, name, color, description from projects
      where workspace_id = ${ctx.ws.id} and (name ilike ${like} or description ilike ${like} or category ilike ${like}) and project_access_level(${ctx.user.id}, id) >= 1 limit 20`,
    sql<{ id: string; title: string; status: TaskStatus; project_id: string; project_name: string }[]>`select t.id, t.title, t.status, t.project_id, p.name as project_name
      from tasks t join projects p on p.id = t.project_id
      where t.workspace_id = ${ctx.ws.id} and (t.title ilike ${like} or t.description ilike ${like}) and project_access_level(${ctx.user.id}, t.project_id) >= 1 limit 30`,
    sql<{ id: string; title: string; icon: string }[]>`select id, title, icon from documents
      where workspace_id = ${ctx.ws.id} and not is_folder and (title ilike ${like} or content ilike ${like}) and document_access_level(${ctx.user.id}, id) >= 1 limit 20`,
  ]);
  const total = projects.length + tasks.length + docs.length;
  return (
    <>
      <PageHeader title="Búsqueda" subtitle={term ? `${total} resultado(s) para «${term}»` : "Escribe al menos 2 caracteres en la barra superior."} />
      <form className="mb-6 max-w-xl"><input name="q" defaultValue={term} className="input" placeholder="Buscar…" autoFocus aria-label="Buscar" /></form>
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-5"><h2 className="mb-3 font-semibold">Proyectos ({projects.length})</h2>
          <ul className="space-y-2">{projects.map((p) => <li key={p.id}><Link href={`${base}/projects/${p.id}`} className="flex items-center gap-2 text-sm hover:underline"><span className="h-2.5 w-2.5 rounded" style={{ background: p.color }} />{p.name}</Link></li>)}</ul></section>
        <section className="card p-5"><h2 className="mb-3 font-semibold">Tareas ({tasks.length})</h2>
          <ul className="space-y-2">{tasks.map((t) => <li key={t.id}><Link href={`${base}/projects/${t.project_id}?task=${t.id}`} className="block text-sm hover:underline">{t.title}</Link><span className="flex items-center gap-2 text-xs text-ink-500"><StatusBadge status={t.status} />{t.project_name}</span></li>)}</ul></section>
        <section className="card p-5"><h2 className="mb-3 font-semibold">Documentos ({docs.length})</h2>
          <ul className="space-y-2">{docs.map((d) => <li key={d.id}><Link href={`${base}/docs/${d.id}`} className="text-sm hover:underline">{d.icon} {d.title}</Link></li>)}</ul></section>
      </div>
    </>
  );
}
