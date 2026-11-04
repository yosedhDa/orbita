import Link from "next/link";
import { getWsContext } from "@/lib/access";
import { listActivity } from "@/lib/queries";
import { ActivityList } from "@/components/Collab";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Actividad" };

export default async function ActivityPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ limit?: string }> }) {
  const { slug } = await params;
  const { limit } = await searchParams;
  const ctx = await getWsContext(slug);
  const n = Math.min(500, Math.max(50, Number(limit) || 50));
  const items = await listActivity(ctx, { limit: n });
  const groups = new Map<string, typeof items>();
  for (const a of items) {
    const k = new Date(a.created_at).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long", timeZone: process.env.APP_TIMEZONE || undefined });
    groups.set(k, [...(groups.get(k) ?? []), a]);
  }
  return (
    <>
      <PageHeader title="Centro de actividad" subtitle="Todo lo que ocurre en los proyectos y documentos a los que tienes acceso." />
      <div className="card max-w-3xl p-5">
        {items.length === 0 && <p className="text-sm text-ink-500">Sin actividad todavía.</p>}
        {[...groups.entries()].map(([day, list]) => (
          <section key={day} className="mb-6 last:mb-0">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-400">{day}</h2>
            <ActivityList items={list} />
          </section>
        ))}
        {items.length === n && <Link href={`?limit=${n + 100}`} className="btn-secondary mt-4">Cargar más</Link>}
      </div>
    </>
  );
}
