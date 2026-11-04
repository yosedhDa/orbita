import { getWsContext } from "@/lib/access";
import { sql } from "@/lib/db";
import { visibleMembers } from "@/lib/queries";
import { changeRole, inviteMember, removeMember, revokeInvitation } from "@/actions/workspace";
import { Avatar, PageHeader, timeAgo } from "@/components/ui";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms";
import { ROLE_DESC, ROLE_LABEL, type WorkspaceRole } from "@/lib/labels";
import { mailEnabled } from "@/lib/mail";

export const metadata = { title: "Miembros" };
const ROLES: WorkspaceRole[] = ["admin", "leader", "member", "guest"];

export default async function MembersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getWsContext(slug);
  const isAdmin = ctx.role === "admin";
  const canInvite = isAdmin || ctx.role === "leader";
  const members = await visibleMembers(ctx);
  const invites = canInvite ? await sql<{ id: string; email: string; role: WorkspaceRole; created_at: Date; expires_at: Date; inviter: string | null; project_name: string | null; invited_by: string | null }[]>`
    select i.id, i.email, i.role, i.created_at, i.expires_at, u.name as inviter, p.name as project_name, i.invited_by from invitations i
    left join users u on u.id = i.invited_by left join projects p on p.id = i.project_id
    where i.workspace_id = ${ctx.ws.id} and i.accepted_at is null and i.revoked_at is null and i.expires_at > now() order by i.created_at desc` : [];

  return (
    <>
      <PageHeader title="Miembros y accesos" subtitle={`${members.length} persona(s) en ${ctx.ws.name}`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <ul className="divide-y divide-ink-100">
            {members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 py-3" data-member={m.email}>
                <Avatar name={m.name} color={m.avatar_color} size={34} />
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{m.name}{m.id === ctx.user.id && <span className="ml-1 text-xs text-ink-400">(tú)</span>}</p><p className="truncate text-xs text-ink-500">{m.email}</p></div>
                {isAdmin && m.id !== ctx.user.id ? (
                  <div className="flex items-center gap-1">
                    <ActionForm action={changeRole} hidden={{ workspaceId: ctx.ws.id, userId: m.id }} className="flex items-center gap-1">
                      <select name="role" defaultValue={m.role} className="input w-auto py-1 text-xs" aria-label={`Rol de ${m.name}`}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
                      <SubmitButton className="btn-secondary btn-sm py-1">Cambiar</SubmitButton>
                    </ActionForm>
                    <ActionButton action={removeMember} hidden={{ workspaceId: ctx.ws.id, userId: m.id }} confirm={`¿Revocar el acceso de ${m.name} a todo el espacio?`} className="btn-ghost btn-sm text-rose-600">Revocar</ActionButton>
                  </div>
                ) : <span className="chip bg-ink-100 text-ink-700">{ROLE_LABEL[m.role]}</span>}
              </li>
            ))}
          </ul>
        </section>

        <div className="space-y-6">
          {canInvite && (
            <section className="card p-5">
              <h2 className="mb-1 font-semibold">Invitar por correo</h2>
              <p className="mb-3 text-xs text-ink-500">{mailEnabled() ? "Se enviará un correo con el enlace de invitación." : "SMTP no configurado: obtendrás un enlace para compartirlo manualmente."}</p>
              <ActionForm action={inviteMember} hidden={{ workspaceId: ctx.ws.id }} resetOnSuccess className="space-y-3">
                <input name="email" type="email" required placeholder="persona@empresa.com" className="input" aria-label="Correo" />
                <select name="role" defaultValue="member" className="input" aria-label="Rol">
                  {ROLES.filter((r) => isAdmin || r === "member" || r === "guest").map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
                <SubmitButton className="btn-primary w-full">Enviar invitación</SubmitButton>
              </ActionForm>
            </section>
          )}
          {invites.length > 0 && (
            <section className="card p-5">
              <h2 className="mb-3 font-semibold">Invitaciones pendientes</h2>
              <ul className="space-y-3">
                {invites.map((i) => (
                  <li key={i.id} className="flex items-start gap-2 text-sm">
                    <div className="min-w-0 flex-1"><p className="truncate font-medium">{i.email}</p>
                      <p className="text-xs text-ink-500">{ROLE_LABEL[i.role]}{i.project_name && ` · proyecto «${i.project_name}»`} · por {i.inviter ?? "—"} {timeAgo(i.created_at)}</p></div>
                    {(isAdmin || i.invited_by === ctx.user.id) && <ActionButton action={revokeInvitation} hidden={{ workspaceId: ctx.ws.id, id: i.id }} confirm="¿Revocar esta invitación?" className="btn-ghost btn-sm text-rose-600">Revocar</ActionButton>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="card p-5">
            <h2 className="mb-3 font-semibold">Roles</h2>
            <ul className="space-y-2 text-sm">{ROLES.map((r) => <li key={r}><b>{ROLE_LABEL[r]}:</b> <span className="text-ink-600">{ROLE_DESC[r]}</span></li>)}</ul>
          </section>
        </div>
      </div>
    </>
  );
}
