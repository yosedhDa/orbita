import Link from "next/link";
import { notFound } from "next/navigation";
import { Crown, Trash2, UserMinus } from "lucide-react";
import { canManageTeam, getWsContext } from "@/lib/access";
import { sql } from "@/lib/db";
import { listActivity, listMembers, listProjects, listTasks } from "@/lib/queries";
import { deleteTeam, setTeamMember, updateTeam } from "@/actions/teams";
import { Avatar, DueDate, PageHeader, Progress, ProjectStatusBadge, StatusBadge, percent, todayStr } from "@/components/ui";
import { ActionButton, ActionForm, Modal, SubmitButton } from "@/components/forms";
import { ActivityList } from "@/components/Collab";
import { Workload, type WorkloadRow } from "@/components/Workload";
import { ROLE_LABEL, type WorkspaceRole } from "@/lib/labels";

export default async function TeamPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await getWsContext(slug);
  if (ctx.role === "guest" || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [team] = await sql<{ id: string; name: string; description: string; color: string }[]>`select id, name, description, color from teams where id = ${id} and workspace_id = ${ctx.ws.id}`;
  if (!team) notFound();
  const base = `/w/${slug}`;
  const manage = await canManageTeam(ctx, id);
  const members = await sql<{ id: string; name: string; email: string; avatar_color: string; is_leader: boolean; role: WorkspaceRole }[]>`
    select u.id, u.name, u.email, u.avatar_color, tm.is_leader, wm.role from team_members tm join users u on u.id = tm.user_id
    join workspace_members wm on wm.user_id = u.id and wm.workspace_id = ${ctx.ws.id} where tm.team_id = ${id} order by tm.is_leader desc, u.name`;
  const ids = members.map((m) => m.id);
  const [projects, tasks, activity, everyone] = await Promise.all([
    listProjects(ctx, { teamId: id }),
    listTasks(ctx, { userIds: ids }),
    listActivity(ctx, { actorIds: ids, limit: 15 }),
    listMembers(ctx.ws.id),
  ]);
  const today = todayStr();
  const workload: WorkloadRow[] = members.map((m) => {
    const mine = tasks.filter((t) => t.assignee_id === m.id);
    return { id: m.id, name: m.name, avatar_color: m.avatar_color,
      pending: mine.filter((t) => t.status === "pending").length, in_progress: mine.filter((t) => t.status === "in_progress").length,
      in_review: mine.filter((t) => t.status === "in_review").length, done: mine.filter((t) => t.status === "done").length,
      overdue: mine.filter((t) => t.status !== "done" && t.due_date && t.due_date < today).length };
  });
  const candidates = everyone.filter((e) => e.role !== "guest" && !ids.includes(e.id));
  const doneAll = tasks.filter((t) => t.status === "done").length;

  return (
    <>
      <PageHeader title={<span className="flex items-center gap-3"><span className="h-6 w-6 rounded-md" style={{ background: team.color }} />{team.name}</span>} subtitle={team.description || undefined}
        actions={manage && (
          <Modal title="Editar equipo" trigger="Editar" triggerClassName="btn-secondary">
            <ActionForm action={updateTeam} hidden={{ workspaceId: ctx.ws.id, teamId: id, color: team.color }} className="space-y-3">
              <div><label className="label" htmlFor="et-name">Nombre</label><input id="et-name" name="name" defaultValue={team.name} required className="input" /></div>
              <div><label className="label" htmlFor="et-desc">Descripción</label><textarea id="et-desc" name="description" defaultValue={team.description} rows={3} className="input" /></div>
              <div className="flex justify-end"><SubmitButton>Guardar</SubmitButton></div>
            </ActionForm>
            {ctx.role === "admin" && (
              <ActionForm action={deleteTeam} hidden={{ workspaceId: ctx.ws.id, teamId: id }} confirm="¿Eliminar este equipo? Los proyectos quedarán sin equipo." className="mt-6 border-t border-ink-100 pt-4">
                <SubmitButton className="btn-danger"><Trash2 className="h-4 w-4" />Eliminar equipo</SubmitButton>
              </ActionForm>
            )}
          </Modal>
        )} />
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-1">
          <h2 className="mb-3 font-semibold">Integrantes ({members.length})</h2>
          <ul className="divide-y divide-ink-100">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2.5">
                <Avatar name={m.name} color={m.avatar_color} size={30} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 truncate text-sm font-medium">{m.name}{m.is_leader && <Crown className="h-3.5 w-3.5 text-amber-500" aria-label="Líder" />}</p>
                  <p className="truncate text-xs text-ink-500">{m.is_leader ? "Líder del equipo" : ROLE_LABEL[m.role]}</p>
                </div>
                <Link href={`${base}/tasks?assignee=${m.id}`} className="btn-ghost btn-sm">Tareas</Link>
                {ctx.role === "admin" && (
                  <ActionButton action={setTeamMember} hidden={{ workspaceId: ctx.ws.id, teamId: id, userId: m.id, op: m.is_leader ? "unlead" : "lead" }} title={m.is_leader ? "Quitar liderazgo" : "Nombrar líder"}>
                    <Crown className={`h-3.5 w-3.5 ${m.is_leader ? "text-amber-500" : ""}`} />
                  </ActionButton>
                )}
                {manage && <ActionButton action={setTeamMember} hidden={{ workspaceId: ctx.ws.id, teamId: id, userId: m.id, op: "remove" }} confirm={`¿Quitar a ${m.name} del equipo?`} title="Quitar"><UserMinus className="h-3.5 w-3.5" /></ActionButton>}
              </li>
            ))}
          </ul>
          {manage && candidates.length > 0 && (
            <ActionForm action={setTeamMember} hidden={{ workspaceId: ctx.ws.id, teamId: id, op: "add" }} className="mt-3 flex gap-2">
              <select name="userId" required className="input" defaultValue="" aria-label="Añadir integrante"><option value="" disabled>Añadir integrante…</option>{candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              <SubmitButton className="btn-secondary">Añadir</SubmitButton>
            </ActionForm>
          )}
        </section>

        <section className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Carga de trabajo</h2><span className="text-sm text-ink-500">Cumplimiento: <b className="text-ink-900">{percent(doneAll, tasks.length)}%</b></span></div>
          <Workload rows={workload} base={base} />
        </section>

        <section className="card p-5 lg:col-span-2">
          <h2 className="mb-3 font-semibold">Proyectos del equipo</h2>
          {projects.length === 0 ? <p className="text-sm text-ink-500">Ningún proyecto asignado a este equipo. Asígnalo desde la configuración del proyecto.</p> : (
            <ul className="divide-y divide-ink-100">
              {projects.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <Link href={`${base}/projects/${p.id}`} className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium hover:underline"><span className="h-2.5 w-2.5 rounded" style={{ background: p.color }} />{p.name}</Link>
                  <ProjectStatusBadge status={p.status} />
                  <div className="flex w-40 items-center gap-2"><Progress value={percent(p.done, p.total)} color={p.color} /><span className="text-xs">{percent(p.done, p.total)}%</span></div>
                </li>
              ))}
            </ul>
          )}
          <h2 className="mb-3 mt-6 font-semibold">Tareas abiertas por integrante</h2>
          <ul className="divide-y divide-ink-100">
            {tasks.filter((t) => t.status !== "done").slice(0, 15).map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2">
                <Avatar name={t.assignee_name} color={t.assignee_color} size={22} />
                <Link href={`${base}/projects/${t.project_id}?task=${t.id}`} className="min-w-0 flex-1 truncate text-sm hover:underline">{t.title}<span className="ml-2 text-xs text-ink-400">{t.project_name}</span></Link>
                <StatusBadge status={t.status} /><DueDate date={t.due_date} />
              </li>
            ))}
            {tasks.filter((t) => t.status !== "done").length === 0 && <li className="py-2 text-sm text-ink-500">Sin tareas abiertas.</li>}
          </ul>
        </section>

        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Actividad de los integrantes</h2>
          <ActivityList items={activity} />
        </section>
      </div>
    </>
  );
}
