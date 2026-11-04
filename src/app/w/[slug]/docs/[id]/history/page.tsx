import Link from "next/link";
import { notFound } from "next/navigation";
import { documentLevel, getWsContext } from "@/lib/access";
import { sql } from "@/lib/db";
import { renderMarkdown } from "@/lib/markdown";
import { restoreVersion } from "@/actions/docs";
import { ActionForm, SubmitButton } from "@/components/forms";
import { PageHeader, timeAgo } from "@/components/ui";

export const metadata = { title: "Historial del documento" };

export default async function HistoryPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ v?: string }> }) {
  const { slug, id } = await params;
  const { v } = await searchParams;
  const ctx = await getWsContext(slug);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const level = await documentLevel(ctx.user.id, id);
  if (level < 1) notFound();
  const [doc] = await sql<{ title: string; version: number }[]>`select title, version from documents where id = ${id}`;
  const versions = await sql<{ id: string; version: number; title: string; content: string; created_at: Date; author: string | null }[]>`
    select dv.id, dv.version, dv.title, dv.content, dv.created_at, u.name as author from document_versions dv left join users u on u.id = dv.author_id
    where dv.document_id = ${id} order by dv.created_at desc limit 100`;
  const selected = versions.find((x) => x.id === v) ?? versions[0];
  const base = `/w/${slug}/docs/${id}`;
  return (
    <>
      <PageHeader title={`Historial: ${doc.title}`} subtitle={`Versión actual: v${doc.version}`} actions={<Link href={base} className="btn-secondary">Volver al documento</Link>} />
      {versions.length === 0 ? <p className="text-sm text-ink-500">Todavía no hay versiones anteriores.</p> : (
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <ul className="card h-fit divide-y divide-ink-100">
            {versions.map((x) => (
              <li key={x.id}><Link href={`${base}/history?v=${x.id}`} className={`block px-4 py-2.5 text-sm hover:bg-ink-50 ${selected?.id === x.id ? "bg-brand-50" : ""}`}>
                <span className="font-medium">v{x.version}</span> · {x.title}<span className="block text-xs text-ink-500">Reemplazada {timeAgo(x.created_at)} por {x.author ?? "—"}</span>
              </Link></li>
            ))}
          </ul>
          {selected && (
            <div className="card p-6">
              <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">v{selected.version}: {selected.title}</h2>
                {level >= 2 && <ActionForm action={restoreVersion} hidden={{ workspaceId: ctx.ws.id, documentId: id, versionId: selected.id }} confirm="¿Restaurar esta versión? La versión actual se guardará en el historial."><SubmitButton className="btn-secondary">Restaurar esta versión</SubmitButton></ActionForm>}</div>
              <div className="prose-doc" dangerouslySetInnerHTML={{ __html: renderMarkdown(selected.content) }} />
            </div>
          )}
        </div>
      )}
    </>
  );
}
