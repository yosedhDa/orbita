import Link from "next/link";
import clsx from "clsx";
import { AtSign, Bell, CheckCheck, MessageSquare, UserPlus, ListChecks } from "lucide-react";
import { getWsContext } from "@/lib/access";
import { sql } from "@/lib/db";
import { markNotificationsRead } from "@/actions/collab";
import { ActionForm, SubmitButton } from "@/components/forms";
import { EmptyState, PageHeader, timeAgo } from "@/components/ui";

export const metadata = { title: "Notificaciones" };
const ICON: Record<string, typeof Bell> = { mention: AtSign, comment: MessageSquare, assignment: ListChecks, invite: UserPlus, status: CheckCheck };

export default async function NotificationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getWsContext(slug);
  const items = await sql<{ id: string; kind: string; title: string; body: string; link: string; read_at: Date | null; created_at: Date; ws_slug: string | null }[]>`
    select n.id, n.kind, n.title, n.body, n.link, n.read_at, n.created_at, w.slug as ws_slug from notifications n left join workspaces w on w.id = n.workspace_id
    where n.user_id = ${ctx.user.id} order by n.created_at desc limit 100`;
  const unread = items.filter((i) => !i.read_at).length;
  return (
    <>
      <PageHeader title="Notificaciones" subtitle={unread ? `${unread} sin leer` : "Estás al día"}
        actions={unread > 0 && <ActionForm action={markNotificationsRead}><SubmitButton className="btn-secondary"><CheckCheck className="h-4 w-4" />Marcar todas como leídas</SubmitButton></ActionForm>} />
      {items.length === 0 ? <EmptyState icon={<Bell className="h-8 w-8" />} title="Sin notificaciones" text="Aquí verás menciones, asignaciones, comentarios y cambios de estado." /> : (
        <ul className="card max-w-3xl divide-y divide-ink-100">
          {items.map((n) => {
            const I = ICON[n.kind] ?? Bell;
            return (
              <li key={n.id} className={clsx("flex items-start gap-3 p-4", !n.read_at && "bg-brand-50/40")} data-notification>
                <span className={clsx("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full", n.read_at ? "bg-ink-100 text-ink-500" : "bg-brand-100 text-brand-700")}><I className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  {n.link ? <Link href={n.link} className="text-sm font-medium hover:underline">{n.title}</Link> : <p className="text-sm font-medium">{n.title}</p>}
                  {n.body && <p className="mt-0.5 line-clamp-2 text-sm text-ink-600">{n.body}</p>}
                  <p className="mt-1 text-xs text-ink-400">{timeAgo(n.created_at)}{n.ws_slug && n.ws_slug !== slug && " · otro espacio"}</p>
                </div>
                {!n.read_at && <ActionForm action={markNotificationsRead} hidden={{ id: n.id }} showMessage={false}><SubmitButton className="btn-ghost btn-sm">Marcar leída</SubmitButton></ActionForm>}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
