import Link from "next/link";
import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { getWsContext } from "@/lib/access";
import { sql } from "@/lib/db";
import { createTeam } from "@/actions/teams";
import { AvatarStack, EmptyState, PageHeader } from "@/components/ui";
import { ActionForm, Modal, SubmitButton } from "@/components/forms";
import { PALETTE } from "@/lib/labels";

export const metadata = { title: "Equipos" };

export default async function TeamsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getWsContext(slug);
  if (ctx.role === "guest") notFound();
  const teams = await sql<{ id: string; name: string; description: string; color: string; members: { name: string; avatar_color: string; is_leader: boolean }[]; projects: number; open_tasks: number }[]>`
    select t.id, t.name, t.description, t.color,
      coalesce((select json_agg(json_build_object('name', u.name, 'avatar_color', u.avatar_color, 'is_leader', tm.is_leader) order by tm.is_leader desc, u.name)
        from team_members tm join users u on u.id = tm.user_id where tm.team_id = t.id), '[]') as members,
      (select count(*) from projects p where p.team_id = t.id)::int as projects,
      (select count(*) from tasks x join team_members tm on tm.user_id = x.assignee_id and tm.team_id = t.id where x.workspace_id = t.workspace_id and x.status <> 'done')::int as open_tasks
    from teams t where t.workspace_id = ${ctx.ws.id} order by t.name`;
  const canCreate = ctx.role === "admin" || ctx.role === "leader";
  return (
    <>
      <PageHeader title="Equipos" subtitle="Organiza a las personas en equipos con líderes, proyectos y carga de trabajo."
        actions={canCreate && (
          <Modal title="Nuevo equipo" trigger="Nuevo equipo">
            <ActionForm action={createTeam} hidden={{ workspaceId: ctx.ws.id }} className="space-y-3">
              <div><label className="label" htmlFor="t-name">Nombre</label><input id="t-name" name="name" required minLength={2} className="input" /></div>
              <div><label className="label" htmlFor="t-desc">Descripción</label><textarea id="t-desc" name="description" rows={2} className="input" /></div>
              <div><span className="label">Color</span><div className="flex gap-2">{PALETTE.map((c, i) => (
                <label key={c}><input type="radio" name="color" value={c} defaultChecked={i === 0} className="peer sr-only" /><span className="block h-6 w-6 cursor-pointer rounded-full ring-2 ring-transparent ring-offset-2 peer-checked:ring-ink-800" style={{ background: c }} /></label>))}</div></div>
              <div className="flex justify-end"><SubmitButton>Crear equipo</SubmitButton></div>
            </ActionForm>
          </Modal>
        )} />
      {teams.length === 0 ? <EmptyState icon={<Users className="h-8 w-8" />} title="Aún no hay equipos" text={canCreate ? "Crea un equipo para agrupar personas y proyectos." : "Un administrador o líder puede crear equipos."} /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {teams.map((t) => (
            <Link key={t.id} href={`/w/${slug}/teams/${t.id}`} className="card p-5 transition hover:shadow-md">
              <div className="flex items-center gap-3"><span className="h-9 w-9 rounded-lg" style={{ background: t.color }} /><div className="min-w-0"><h3 className="truncate font-semibold">{t.name}</h3>
                <p className="text-xs text-ink-500">Líder: {t.members.filter((m) => m.is_leader).map((m) => m.name).join(", ") || "sin asignar"}</p></div></div>
              <p className="mt-3 line-clamp-2 min-h-[2.5rem] text-sm text-ink-500">{t.description || "Sin descripción"}</p>
              <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3 text-xs text-ink-500">
                <AvatarStack people={t.members} /><span>{t.projects} proyectos · {t.open_tasks} tareas abiertas</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
