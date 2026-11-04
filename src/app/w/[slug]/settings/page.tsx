import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { getWsContext } from "@/lib/access";
import { sql } from "@/lib/db";
import { updateWorkspace } from "@/actions/workspace";
import { ActionForm, SubmitButton } from "@/components/forms";
import { PageHeader, timeAgo } from "@/components/ui";
import { mailEnabled } from "@/lib/mail";

export const metadata = { title: "Configuración" };

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getWsContext(slug);
  if (ctx.role !== "admin") notFound();
  const audit = await sql<{ id: string; action: string; summary: string; created_at: Date; actor: string | null }[]>`
    select a.id::text, a.action, a.summary, a.created_at, u.name as actor from activity_log a left join users u on u.id = a.actor_id
    where a.workspace_id = ${ctx.ws.id} and (a.action like 'member.%' or a.action like 'share.%' or a.action like 'workspace.%' or a.action like '%.deleted' or a.action = 'project.shared' or a.action like 'team.member_%')
    order by a.id desc limit 100`;
  const [stats] = await sql<{ members: number; projects: number; tasks: number; docs: number; storage: number }[]>`
    select (select count(*) from workspace_members where workspace_id = ${ctx.ws.id})::int as members,
           (select count(*) from projects where workspace_id = ${ctx.ws.id})::int as projects,
           (select count(*) from tasks where workspace_id = ${ctx.ws.id})::int as tasks,
           (select count(*) from documents where workspace_id = ${ctx.ws.id})::int as docs,
           (select coalesce(sum(size_bytes), 0) from attachments where workspace_id = ${ctx.ws.id})::bigint as storage`;
  return (
    <>
      <PageHeader title="Configuración del espacio" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-3 font-semibold">General</h2>
            <ActionForm action={updateWorkspace} hidden={{ workspaceId: ctx.ws.id }} className="space-y-3">
              <div><label className="label" htmlFor="ws-name">Nombre del espacio</label><input id="ws-name" name="name" defaultValue={ctx.ws.name} required className="input" /></div>
              <SubmitButton>Guardar</SubmitButton>
            </ActionForm>
            <p className="mt-3 text-xs text-ink-500">Identificador de URL: <code>/w/{ctx.ws.slug}</code></p>
          </section>
          <section className="card p-5 text-sm">
            <h2 className="mb-3 font-semibold">Uso</h2>
            <dl className="space-y-1.5">
              {[["Miembros", stats.members], ["Proyectos", stats.projects], ["Tareas", stats.tasks], ["Documentos", stats.docs], ["Archivos", `${(Number(stats.storage) / 1024 / 1024).toFixed(1)} MB`]].map(([k, v]) => (
                <div key={k as string} className="flex justify-between"><dt className="text-ink-500">{k}</dt><dd className="font-medium">{v}</dd></div>))}
            </dl>
          </section>
          <section className="card p-5 text-sm">
            <h2 className="mb-3 font-semibold">Exportar datos</h2>
            <p className="mb-3 text-ink-500">Archivos CSV compatibles con Excel y Google Sheets.</p>
            <div className="flex flex-wrap gap-2">
              <a className="btn-secondary" href={`/api/export?ws=${ctx.ws.id}&type=tasks`}><Download className="h-4 w-4" />Tareas</a>
              <a className="btn-secondary" href={`/api/export?ws=${ctx.ws.id}&type=projects`}><Download className="h-4 w-4" />Proyectos</a>
            </div>
          </section>
          <section className="card p-5 text-sm">
            <h2 className="mb-3 font-semibold">Servicios</h2>
            <p className="flex justify-between"><span>Correo (SMTP)</span><span className={mailEnabled() ? "text-emerald-600" : "text-amber-600"}>{mailEnabled() ? "Configurado" : "No configurado"}</span></p>
            {!mailEnabled() && <p className="mt-2 text-xs text-ink-500">Sin SMTP, las invitaciones muestran un enlace para copiar y la recuperación de contraseña no envía correos. Configura SMTP_HOST, SMTP_USER, SMTP_PASS y SMTP_FROM.</p>}
          </section>
        </div>
        <section className="card p-5 lg:col-span-2">
          <h2 className="mb-1 font-semibold">Registro de auditoría</h2>
          <p className="mb-4 text-sm text-ink-500">Accesos, invitaciones, cambios de rol, enlaces compartidos y eliminaciones.</p>
          {audit.length === 0 ? <p className="text-sm text-ink-500">Sin eventos.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-ink-100 text-left text-xs text-ink-500"><th className="py-2 pr-3 font-medium">Cuándo</th><th className="py-2 pr-3 font-medium">Quién</th><th className="py-2 font-medium">Acción</th></tr></thead>
                <tbody className="divide-y divide-ink-50">
                  {audit.map((a) => (
                    <tr key={a.id}><td className="whitespace-nowrap py-2 pr-3 text-xs text-ink-500" title={new Date(a.created_at).toISOString()}>{timeAgo(a.created_at)}</td>
                      <td className="whitespace-nowrap py-2 pr-3">{a.actor ?? "—"}</td><td className="py-2 text-ink-700">{a.summary} <code className="ml-1 text-[10px] text-ink-400">{a.action}</code></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
