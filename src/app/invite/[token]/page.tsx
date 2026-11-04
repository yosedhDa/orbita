import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { acceptInvitation } from "@/actions/workspace";
import { logout } from "@/actions/auth";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Logo } from "@/components/Logo";
import { ROLE_LABEL, type WorkspaceRole } from "@/lib/labels";

export const metadata = { title: "Invitación" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [inv] = await sql<{ email: string; role: WorkspaceRole; ws_name: string; inviter: string | null; project_name: string | null }[]>`
    select i.email, i.role, w.name as ws_name, u.name as inviter, p.name as project_name
    from invitations i join workspaces w on w.id = i.workspace_id left join users u on u.id = i.invited_by left join projects p on p.id = i.project_id
    where i.token_hash = ${sha256(token)} and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()`;
  const user = await getCurrentUser();
  const next = `/invite/${token}`;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-brand-50 to-ink-50 px-4">
      <Logo className="mb-8 text-xl" />
      <div className="card w-full max-w-md p-6 sm:p-8">
        {!inv ? (
          <><h1 className="text-lg font-semibold">Invitación no disponible</h1><p className="mt-2 text-sm text-ink-500">El enlace no es válido, fue revocado o ha caducado. Pide una nueva invitación.</p>
            <Link href="/" className="btn-secondary mt-6">Ir al inicio</Link></>
        ) : (
          <>
            <h1 className="text-lg font-semibold">Te invitaron a «{inv.ws_name}»</h1>
            <p className="mt-2 text-sm text-ink-600">
              {inv.inviter ?? "Alguien"} te invitó como <b>{ROLE_LABEL[inv.role]}</b>
              {inv.project_name && <> al proyecto <b>«{inv.project_name}»</b></>}. Invitación para <b>{inv.email}</b>.
            </p>
            {!user ? (
              <div className="mt-6 flex flex-col gap-2">
                <Link href={`/register?next=${encodeURIComponent(next)}&email=${encodeURIComponent(inv.email)}`} className="btn-primary">Crear cuenta y unirme</Link>
                <Link href={`/login?next=${encodeURIComponent(next)}`} className="btn-secondary">Ya tengo cuenta</Link>
              </div>
            ) : user.email.toLowerCase() !== inv.email.toLowerCase() ? (
              <div className="mt-6">
                <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Has iniciado sesión como {user.email}. Esta invitación es para {inv.email}.</p>
                <form action={logout} className="mt-4"><button className="btn-secondary w-full">Cerrar sesión y cambiar de cuenta</button></form>
              </div>
            ) : (
              <ActionForm action={acceptInvitation} hidden={{ token }} className="mt-6">
                <SubmitButton className="btn-primary w-full">Aceptar invitación</SubmitButton>
              </ActionForm>
            )}
          </>
        )}
      </div>
    </div>
  );
}
