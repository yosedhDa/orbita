import Link from "next/link";
import { BookOpen, Lock } from "lucide-react";
import { getWsContext } from "@/lib/access";
import { listDocs } from "@/lib/docs";
import { DocTree } from "@/components/DocTree";
import { EmptyState, PageHeader, timeAgo } from "@/components/ui";

export const metadata = { title: "Documentos" };

export default async function DocsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ category?: string }> }) {
  const { slug } = await params;
  const { category } = await searchParams;
  const ctx = await getWsContext(slug);
  const base = `/w/${slug}`;
  const docs = await listDocs(ctx);
  const pages = docs.filter((d) => !d.is_folder);
  const categories = [...new Set(pages.map((d) => d.category).filter(Boolean))].sort();
  const shown = pages.filter((d) => !category || d.category === category).sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at));
  return (
    <>
      <PageHeader title="Documentos y base de conocimiento" subtitle="Páginas, notas y documentación colaborativa del espacio." />
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="card h-fit p-3"><DocTree docs={docs} base={base} workspaceId={ctx.ws.id} canCreate={ctx.role !== "guest"} /></aside>
        <div>
          {categories.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              <Link href={`${base}/docs`} className={`chip px-3 py-1 text-xs ${!category ? "bg-ink-900 text-white" : "bg-white ring-1 ring-ink-200"}`}>Todas</Link>
              {categories.map((c) => <Link key={c} href={`${base}/docs?category=${encodeURIComponent(c)}`} className={`chip px-3 py-1 text-xs ${category === c ? "bg-ink-900 text-white" : "bg-white ring-1 ring-ink-200"}`}>{c}</Link>)}
            </div>
          )}
          {shown.length === 0 ? <EmptyState icon={<BookOpen className="h-8 w-8" />} title="No hay documentos" text="Crea una página para documentar procesos, actas, especificaciones o tu base de conocimiento." /> : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((d) => (
                <Link key={d.id} href={`${base}/docs/${d.id}`} className="card p-4 transition hover:shadow-md">
                  <div className="flex items-start justify-between"><span className="text-2xl">{d.icon}</span>{d.visibility === "private" && <Lock className="h-3.5 w-3.5 text-ink-400" />}</div>
                  <p className="mt-2 truncate font-medium">{d.title}</p>
                  <p className="mt-1 flex flex-wrap gap-1.5 text-xs text-ink-500">
                    {d.category && <span className="chip bg-ink-100 text-ink-600">{d.category}</span>}
                    {d.project_name && <span className="chip bg-brand-50 text-brand-700">{d.project_name}</span>}
                    <span>Editado {timeAgo(d.updated_at)}</span>
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
