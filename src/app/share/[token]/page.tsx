import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { renderMarkdown } from "@/lib/markdown";
import { Logo } from "@/components/Logo";
import { DueDate, PriorityBadge, Progress, ProjectStatusBadge, StatusBadge, fmtDate, percent } from "@/components/ui";
import { STATUS_LABEL, STATUS_ORDER, type Priority, type ProjectStatus, type TaskStatus } from "@/lib/labels";

export const metadata = { title: "Contenido compartido", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Vista pública de sólo lectura. Sólo expone el elemento compartido; nunca correos, comentarios ni archivos. */
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) notFound();
  const [link] = await sql<{ entity_type: "project" | "document"; entity_id: string; ws_name: string }[]>`
    select s.entity_type, s.entity_id, w.name as ws_name from share_links s join workspaces w on w.id = s.workspace_id
    where s.token = ${token} and s.revoked_at is null and (s.expires_at is null or s.expires_at > now())`;
  if (!link) notFound();

  let content: React.ReactNode;
  if (link.entity_type === "document") {
    const [d] = await sql<{ title: string; icon: string; content: string; updated_at: Date }[]>`select title, icon, content, updated_at from documents where id = ${link.entity_id} and not is_folder`;
    if (!d) notFound();
    content = (
      <article className="card p-6 sm:p-10">
        <h1 className="mb-2 text-3xl font-bold tracking-tight">{d.icon} {d.title}</h1>
        <p className="mb-6 text-xs text-ink-400">Actualizado el {new Date(d.updated_at).toLocaleDateString("es")}</p>
        <div className="prose-doc" dangerouslySetInnerHTML={{ __html: renderMarkdown(d.content) }} />
      </article>
    );
  } else {
    const [p] = await sql<{ name: string; description: string; objectives: string; color: string; status: ProjectStatus; priority: Priority; start_date: string | null; end_date: string | null }[]>`
      select name, description, objectives, color, status, priority, to_char(start_date, 'YYYY-MM-DD') start_date, to_char(end_date, 'YYYY-MM-DD') end_date from projects where id = ${link.entity_id}`;
    if (!p) notFound();
    const tasks = await sql<{ id: string; title: string; status: TaskStatus; priority: Priority; due_date: string | null; assignee: string | null }[]>`
      select t.id, t.title, t.status, t.priority, to_char(t.due_date, 'YYYY-MM-DD') due_date, split_part(u.name, ' ', 1) as assignee
      from tasks t left join users u on u.id = t.assignee_id where t.project_id = ${link.entity_id} and t.parent_id is null order by t.position`;
    const pct = percent(tasks.filter((t) => t.status === "done").length, tasks.length);
    content = (
      <div className="space-y-6">
        <section className="card p-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl font-bold text-white" style={{ background: p.color }}>{p.name[0]}</span>
            <h1 className="flex-1 text-2xl font-bold tracking-tight">{p.name}</h1>
            <ProjectStatusBadge status={p.status} /><PriorityBadge priority={p.priority} />
          </div>
          {(p.start_date || p.end_date) && <p className="mt-2 text-sm text-ink-500">{fmtDate(p.start_date, true) || "—"} → {fmtDate(p.end_date, true) || "—"}</p>}
          {p.description && <p className="mt-4 whitespace-pre-wrap text-sm text-ink-700">{p.description}</p>}
          {p.objectives && <ul className="mt-3 list-disc pl-5 text-sm text-ink-700">{p.objectives.split("\n").filter(Boolean).map((o, i) => <li key={i}>{o}</li>)}</ul>}
          <div className="mt-5 flex items-center gap-3"><Progress value={pct} color={p.color} /><span className="text-sm font-semibold">{pct}%</span></div>
        </section>
        {STATUS_ORDER.map((s) => {
          const g = tasks.filter((t) => t.status === s);
          if (!g.length) return null;
          return (
            <section key={s} className="card overflow-hidden">
              <h2 className="border-b border-ink-100 bg-ink-50 px-4 py-2 text-sm font-semibold">{STATUS_LABEL[s]} ({g.length})</h2>
              <ul className="divide-y divide-ink-100">
                {g.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="flex-1">{t.title}</span><PriorityBadge priority={t.priority} /><DueDate date={t.due_date} done={t.status === "done"} />
                    <span className="w-20 truncate text-right text-xs text-ink-500">{t.assignee ?? ""}</span><StatusBadge status={t.status} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-ink-50">
      <header className="border-b border-ink-200 bg-white"><div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3"><Logo /><span className="text-xs text-ink-500">Compartido desde «{link.ws_name}» · sólo lectura</span></div></header>
      <main className="mx-auto max-w-4xl px-4 py-8">{content}</main>
    </div>
  );
}
