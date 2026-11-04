import { Link2, Trash2 } from "lucide-react";
import { createShareLink, revokeShareLink } from "@/actions/collab";
import { inviteMember } from "@/actions/workspace";
import { setProjectMember } from "@/actions/projects";
import { listShareLinks } from "@/lib/queries";
import { appUrl } from "@/lib/mail";
import { PROJECT_ROLE_LABEL, ROLE_LABEL, type ProjectRole, type WorkspaceRole } from "@/lib/labels";
import { ActionButton, ActionForm, CopyField, SubmitButton } from "./forms";
import { Avatar } from "./ui";

/** Enlaces públicos de sólo lectura para un proyecto o documento. */
export async function PublicLinks({ workspaceId, type, id, canManage }: { workspaceId: string; type: "project" | "document"; id: string; canManage: boolean }) {
  const links = await listShareLinks(type, id);
  return (
    <div>
      <p className="mb-3 text-sm text-ink-500">Cualquier persona con el enlace podrá <b>ver</b> {type === "project" ? "el proyecto y sus tareas" : "este documento"} sin iniciar sesión. No se muestran correos, comentarios, archivos ni otros proyectos.</p>
      <ul className="mb-3 space-y-2">
        {links.map((l) => (
          <li key={l.id} className="rounded-lg p-2 ring-1 ring-ink-100">
            <CopyField value={`${appUrl()}/share/${l.token}`} />
            <div className="mt-1 flex items-center justify-between text-xs text-ink-500">
              <span>Creado por {l.creator ?? "—"}{l.expires_at ? ` · caduca el ${new Date(l.expires_at).toLocaleDateString("es")}` : " · sin caducidad"}</span>
              {canManage && <ActionButton action={revokeShareLink} hidden={{ workspaceId, linkId: l.id }} confirm="¿Revocar este enlace? Dejará de funcionar inmediatamente." className="btn-ghost btn-sm text-rose-600"><Trash2 className="h-3 w-3" />Revocar</ActionButton>}
            </div>
          </li>
        ))}
      </ul>
      {canManage && (
        <ActionForm action={createShareLink} hidden={{ workspaceId, entityType: type, entityId: id }} className="flex flex-wrap items-center gap-2" showMessage={false}>
          <select name="days" className="input w-auto py-1.5" aria-label="Caducidad"><option value="0">Sin caducidad</option><option value="7">7 días</option><option value="30">30 días</option></select>
          <SubmitButton className="btn-secondary py-1.5"><Link2 className="h-4 w-4" />Crear enlace público</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}

type PM = { user_id: string; name: string; email: string; avatar_color: string; role: ProjectRole; ws_role: WorkspaceRole };

export function ProjectMembers({ workspaceId, projectId, members, candidates, canManage }: {
  workspaceId: string; projectId: string; members: PM[]; candidates: { id: string; name: string }[]; canManage: boolean;
}) {
  return (
    <div>
      <ul className="mb-4 divide-y divide-ink-100">
        {members.map((m) => (
          <li key={m.user_id} className="flex flex-wrap items-center gap-3 py-2.5">
            <Avatar name={m.name} color={m.avatar_color} size={30} />
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{m.name}</p><p className="truncate text-xs text-ink-500">{m.email} · {ROLE_LABEL[m.ws_role]}</p></div>
            {canManage ? (
              <ActionForm action={setProjectMember} hidden={{ workspaceId, projectId, userId: m.user_id }} className="flex items-center gap-1">
                <select name="role" defaultValue={m.role} className="input w-auto py-1 text-xs" aria-label={`Permiso de ${m.name}`}>
                  {(["viewer", "editor", "admin"] as ProjectRole[]).map((r) => <option key={r} value={r}>{PROJECT_ROLE_LABEL[r]}</option>)}
                  <option value="remove">Quitar acceso</option>
                </select>
                <SubmitButton className="btn-secondary btn-sm py-1">Aplicar</SubmitButton>
              </ActionForm>
            ) : <span className="chip bg-ink-100 text-ink-600">{PROJECT_ROLE_LABEL[m.role]}</span>}
          </li>
        ))}
      </ul>
      {canManage && (
        <div className="space-y-4">
          {candidates.length > 0 && (
            <ActionForm action={setProjectMember} hidden={{ workspaceId, projectId }} className="flex flex-wrap gap-2">
              <select name="userId" required className="input w-auto flex-1" aria-label="Miembro del espacio" defaultValue="">
                <option value="" disabled>Añadir miembro del espacio…</option>{candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select name="role" defaultValue="editor" className="input w-auto" aria-label="Permiso"><option value="viewer">Lectura</option><option value="editor">Edición</option><option value="admin">Administración</option></select>
              <SubmitButton className="btn-secondary">Añadir</SubmitButton>
            </ActionForm>
          )}
          <div className="rounded-lg bg-ink-50 p-3">
            <p className="mb-2 text-sm font-medium">Invitar por correo electrónico</p>
            <ActionForm action={inviteMember} hidden={{ workspaceId, projectId }} resetOnSuccess className="flex flex-wrap gap-2">
              <input name="email" type="email" required placeholder="persona@empresa.com" className="input min-w-[200px] flex-1" aria-label="Correo" />
              <select name="role" defaultValue="guest" className="input w-auto" aria-label="Tipo de acceso"><option value="guest">Invitado (sólo este proyecto)</option><option value="member">Colaborador del espacio</option></select>
              <select name="projectRole" defaultValue="editor" className="input w-auto" aria-label="Permiso"><option value="viewer">Lectura</option><option value="editor">Edición</option><option value="admin">Administración</option></select>
              <SubmitButton>Invitar</SubmitButton>
            </ActionForm>
          </div>
        </div>
      )}
    </div>
  );
}
