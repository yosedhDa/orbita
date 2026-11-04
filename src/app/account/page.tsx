import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { updateProfile, logout } from "@/actions/auth";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Logo } from "@/components/Logo";
import { Avatar } from "@/components/ui";
import { ROLE_LABEL, type WorkspaceRole } from "@/lib/labels";

export const metadata = { title: "Mi cuenta" };

export default async function AccountPage() {
  const user = await requireUser();
  const spaces = await sql<{ name: string; slug: string; role: WorkspaceRole }[]>`select w.name, w.slug, wm.role from workspace_members wm join workspaces w on w.id = wm.workspace_id where wm.user_id = ${user.id} order by w.name`;
  const sessions = await sql<{ created_at: Date; user_agent: string | null }[]>`select created_at, user_agent from sessions where user_id = ${user.id} and expires_at > now() order by created_at desc limit 10`;
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between"><Link href="/"><Logo /></Link><form action={logout}><button className="btn-ghost">Cerrar sesión</button></form></div>
      <div className="mb-6 flex items-center gap-4"><Avatar name={user.name} color={user.avatar_color} size={56} /><div><h1 className="h-page">{user.name}</h1><p className="text-sm text-ink-500">{user.email}</p></div></div>
      <section className="card mb-6 p-5">
        <h2 className="mb-4 font-semibold">Perfil y contraseña</h2>
        <ActionForm action={updateProfile} className="space-y-3">
          <div><label className="label" htmlFor="a-name">Nombre</label><input id="a-name" name="name" defaultValue={user.name} required minLength={2} className="input" /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="a-cur">Contraseña actual</label><input id="a-cur" name="current" type="password" autoComplete="current-password" className="input" /></div>
            <div><label className="label" htmlFor="a-new">Nueva contraseña</label><input id="a-new" name="next" type="password" minLength={8} autoComplete="new-password" className="input" /></div>
          </div>
          <SubmitButton>Guardar</SubmitButton>
        </ActionForm>
      </section>
      <section className="card mb-6 p-5">
        <h2 className="mb-3 font-semibold">Espacios de trabajo</h2>
        <ul className="divide-y divide-ink-100">{spaces.map((s) => <li key={s.slug} className="flex justify-between py-2 text-sm"><Link href={`/w/${s.slug}`} className="text-brand-600 hover:underline">{s.name}</Link><span className="text-ink-500">{ROLE_LABEL[s.role]}</span></li>)}</ul>
        <Link href="/onboarding" className="btn-secondary mt-3">Crear otro espacio</Link>
      </section>
      <section className="card p-5">
        <h2 className="mb-3 font-semibold">Sesiones activas</h2>
        <ul className="space-y-1 text-xs text-ink-600">{sessions.map((s, i) => <li key={i}>{new Date(s.created_at).toLocaleString("es")} — {(s.user_agent ?? "").slice(0, 90)}</li>)}</ul>
      </section>
    </div>
  );
}
