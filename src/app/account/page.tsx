import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { updateProfile, logout } from "@/actions/auth";
import { ActionForm, CopyField, SubmitButton } from "@/components/forms";
import { resetCalendarToken } from "@/actions/stage3";
import { appUrl } from "@/lib/mail";
import { Logo } from "@/components/Logo";
import { Avatar } from "@/components/ui";
import { ROLE_LABEL, type WorkspaceRole } from "@/lib/labels";

export const metadata = { title: "Mi cuenta" };

export default async function AccountPage() {
  const user = await requireUser();
  const spaces = await sql<{ name: string; slug: string; role: WorkspaceRole }[]>`select w.name, w.slug, wm.role from workspace_members wm join workspaces w on w.id = wm.workspace_id where wm.user_id = ${user.id} order by w.name`;
  const [{ calendar_token }] = await sql<{ calendar_token: string | null }[]>`select calendar_token from users where id = ${user.id}`;
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
      <section className="card mb-6 p-5" id="calendario">
        <h2 className="mb-1 font-semibold">Suscripción de calendario</h2>
        <p className="mb-3 text-sm text-ink-500">Ve tus tareas, reuniones, hitos y fines de proyecto en Google Calendar, Outlook o Apple Calendar.
          En Google Calendar: <b>Otros calendarios → + → Desde URL</b> y pega la dirección. Se actualiza automáticamente (Google tarda hasta unas horas).</p>
        {calendar_token ? (
          <>
            <p className="label">Mis tareas (asignadas o como colaborador)</p>
            <CopyField value={`${appUrl()}/api/calendar/${calendar_token}.ics`} />
            <p className="label mt-3">Todas las tareas que puedo ver</p>
            <CopyField value={`${appUrl()}/api/calendar/${calendar_token}.ics?scope=all`} />
            <p className="mt-3 text-xs text-amber-700">Esta URL es privada: quien la tenga verá estos eventos. Si se filtra, genera una nueva.</p>
            <div className="mt-3 flex gap-2">
              <ActionForm action={resetCalendarToken}><SubmitButton className="btn-secondary">Generar nueva URL</SubmitButton></ActionForm>
              <ActionForm action={resetCalendarToken} hidden={{ disable: "1" }}><SubmitButton className="btn-ghost text-rose-600">Desactivar</SubmitButton></ActionForm>
            </div>
          </>
        ) : (
          <ActionForm action={resetCalendarToken}><SubmitButton>Activar suscripción de calendario</SubmitButton></ActionForm>
        )}
      </section>
      <section className="card p-5">
        <h2 className="mb-3 font-semibold">Sesiones activas</h2>
        <ul className="space-y-1 text-xs text-ink-600">{sessions.map((s, i) => <li key={i}>{new Date(s.created_at).toLocaleString("es")} — {(s.user_agent ?? "").slice(0, 90)}</li>)}</ul>
      </section>
    </div>
  );
}
