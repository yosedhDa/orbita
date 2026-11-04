"use client";
import { ActionForm, SubmitButton, type FormAction } from "./forms";
import { PALETTE } from "@/lib/labels";

type Opt = { id: string; name: string };
export type ProjectInitial = {
  id?: string; name?: string; description?: string; objectives?: string; category?: string; team_id?: string | null; owner_id?: string | null;
  priority?: string; status?: string; visibility?: string; color?: string; start_date?: string | null; end_date?: string | null;
};

export function ProjectForm({ action, workspaceId, members, teams, initial = {}, canAdmin = true, submitLabel = "Crear proyecto", categories = [] }: {
  action: FormAction; workspaceId: string; members: Opt[]; teams: Opt[]; initial?: ProjectInitial; canAdmin?: boolean; submitLabel?: string; categories?: string[];
}) {
  return (
    <ActionForm action={action} hidden={{ workspaceId, projectId: initial.id }} className="space-y-4">
      <div><label className="label" htmlFor="pf-name">Nombre del proyecto *</label>
        <input id="pf-name" name="name" required minLength={2} maxLength={120} defaultValue={initial.name} className="input" placeholder="Ej. Lanzamiento sitio web" /></div>
      <div><label className="label" htmlFor="pf-desc">Descripción</label>
        <textarea id="pf-desc" name="description" rows={3} defaultValue={initial.description} className="input" placeholder="¿De qué trata este proyecto?" /></div>
      <div><label className="label" htmlFor="pf-obj">Objetivos</label>
        <textarea id="pf-obj" name="objectives" rows={3} defaultValue={initial.objectives} className="input" placeholder="Un objetivo por línea" /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label" htmlFor="pf-owner">Responsable</label>
          <select id="pf-owner" name="ownerId" defaultValue={initial.owner_id ?? ""} className="input" disabled={!canAdmin}>
            <option value="">Yo</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select></div>
        <div><label className="label" htmlFor="pf-team">Equipo</label>
          <select id="pf-team" name="teamId" defaultValue={initial.team_id ?? ""} className="input">
            <option value="">Sin equipo</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select></div>
        <div><label className="label" htmlFor="pf-cat">Área o categoría</label>
          <input id="pf-cat" name="category" list="pf-cats" defaultValue={initial.category} className="input" placeholder="Ej. Marketing" maxLength={60} />
          <datalist id="pf-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist></div>
        <div><label className="label" htmlFor="pf-prio">Prioridad</label>
          <select id="pf-prio" name="priority" defaultValue={initial.priority ?? "medium"} className="input">
            <option value="high">Alta</option><option value="medium">Media</option><option value="low">Baja</option>
          </select></div>
        <div><label className="label" htmlFor="pf-start">Fecha de inicio</label><input id="pf-start" type="date" name="startDate" defaultValue={initial.start_date ?? ""} className="input" /></div>
        <div><label className="label" htmlFor="pf-end">Fecha de finalización</label><input id="pf-end" type="date" name="endDate" defaultValue={initial.end_date ?? ""} className="input" /></div>
        {initial.id && (
          <div><label className="label" htmlFor="pf-status">Estado</label>
            <select id="pf-status" name="status" defaultValue={initial.status ?? "active"} className="input">
              <option value="active">Activo</option><option value="on_hold">En pausa</option><option value="completed">Finalizado</option><option value="archived">Archivado</option>
            </select></div>
        )}
        <div><label className="label" htmlFor="pf-vis">Visibilidad</label>
          <select id="pf-vis" name="visibility" defaultValue={initial.visibility ?? "workspace"} className="input" disabled={!canAdmin}>
            <option value="workspace">Todo el espacio puede verlo</option><option value="private">Privado: sólo participantes</option>
          </select>
          {!canAdmin && <input type="hidden" name="visibility" value={initial.visibility ?? "workspace"} />}</div>
      </div>
      <fieldset><legend className="label">Color</legend>
        <div className="flex flex-wrap gap-2">
          {PALETTE.map((c, i) => (
            <label key={c} className="cursor-pointer">
              <input type="radio" name="color" value={c} defaultChecked={(initial.color ?? PALETTE[0]) === c || (!initial.color && i === 0)} className="peer sr-only" />
              <span className="block h-7 w-7 rounded-full ring-2 ring-transparent ring-offset-2 peer-checked:ring-ink-800" style={{ background: c }} />
            </label>
          ))}
        </div></fieldset>
      <div className="flex justify-end pt-2"><SubmitButton>{submitLabel}</SubmitButton></div>
    </ActionForm>
  );
}
