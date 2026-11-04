import { getWsContext } from "@/lib/access";
import { sql } from "@/lib/db";
import { AppShell } from "@/components/AppShell";

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getWsContext(slug);
  const [spaces, projects, meta] = await Promise.all([
    sql<{ name: string; slug: string }[]>`select w.name, w.slug from workspace_members wm join workspaces w on w.id = wm.workspace_id where wm.user_id = ${ctx.user.id} order by w.name`,
    sql<{ id: string; name: string; color: string }[]>`select id, name, color from projects
      where workspace_id = ${ctx.ws.id} and status in ('active', 'on_hold') and project_access_level(${ctx.user.id}, id) >= 1 order by name limit 50`,
    sql<{ v: string | null; unread: number }[]>`select (select max(id)::text from activity_log where workspace_id = ${ctx.ws.id}) as v,
      (select count(*)::int from notifications where user_id = ${ctx.user.id} and read_at is null) as unread`,
  ]);
  return (
    <AppShell ws={ctx.ws} role={ctx.role} user={ctx.user} spaces={spaces} projects={projects} unread={meta[0].unread} version={meta[0].v ?? "0"}>
      {children}
    </AppShell>
  );
}
