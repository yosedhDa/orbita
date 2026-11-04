import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { createWorkspace } from "@/actions/workspace";
import { logout } from "@/actions/auth";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Logo } from "@/components/Logo";

export const metadata = { title: "Nuevo espacio de trabajo" };

export default async function Onboarding() {
  const user = await requireUser();
  const spaces = await sql<{ name: string; slug: string }[]>`select w.name, w.slug from workspace_members wm join workspaces w on w.id = wm.workspace_id where wm.user_id = ${user.id} order by w.name`;
  const pending = await sql<{ name: string }[]>`select w.name from invitations i join workspaces w on w.id = i.workspace_id
    where lower(i.email) = ${user.email.toLowerCase()} and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()`;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-brand-50 to-ink-50 px-4 py-10">
      <Logo className="mb-8 text-xl" />
      <div className="card w-full max-w-md p-6 sm:p-8">
        <h1 className="text-lg font-semibold">Hola, {user.name.split(" ")[0]} 👋</h1>
        <p className="mb-6 mt-1 text-sm text-ink-500">Crea un espacio de trabajo para tu organización o equipo. Serás su administrador.</p>
        <ActionForm action={createWorkspace} className="space-y-4">
          <div><label className="label" htmlFor="name">Nombre del espacio</label><input id="name" name="name" required minLength={2} placeholder="Ej. Marketing Acme" className="input" /></div>
          <SubmitButton className="btn-primary w-full">Crear espacio de trabajo</SubmitButton>
        </ActionForm>
        {pending.length > 0 && (
          <p className="mt-6 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Tienes {pending.length} invitación(es) pendiente(s) ({pending.map((p) => p.name).join(", ")}). Abre el enlace que recibiste para unirte.</p>
        )}
        {spaces.length > 0 && (
          <div className="mt-6 border-t border-ink-100 pt-4">
            <p className="label">Tus espacios</p>
            <ul className="space-y-1">{spaces.map((s) => <li key={s.slug}><Link className="text-sm text-brand-600 hover:underline" href={`/w/${s.slug}`}>{s.name}</Link></li>)}</ul>
          </div>
        )}
        <form action={logout} className="mt-6 text-center"><button className="text-xs text-ink-500 hover:underline">Cerrar sesión ({user.email})</button></form>
      </div>
    </div>
  );
}
