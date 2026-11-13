"use client";
import { useState } from "react";
import { createAutomation } from "@/actions/stage3";
import { ActionForm, SubmitButton } from "./forms";

const STATUS = [["pending", "Pendiente"], ["in_progress", "En progreso"], ["in_review", "En revisión"], ["done", "Completada"]] as const;

export function AutomationForm({ workspaceId, projectId, members }: { workspaceId: string; projectId: string; members: { id: string; name: string }[] }) {
  const [trigger, setTrigger] = useState("status_changed");
  const [action, setAction] = useState("notify_user");
  return (
    <ActionForm action={createAutomation} hidden={{ workspaceId, projectId }} resetOnSuccess className="space-y-3">
      <div><label className="label" htmlFor="au-name">Nombre de la regla</label>
        <input id="au-name" name="name" required minLength={2} placeholder="Ej. Avisar a QA cuando algo pase a revisión" className="input" /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="au-trigger">Cuando…</label>
          <select id="au-trigger" name="trigger" value={trigger} onChange={(e) => setTrigger(e.target.value)} className="input">
            <option value="task_created">se crea una tarea</option><option value="status_changed">una tarea cambia de estado</option>
          </select></div>
        {trigger === "status_changed" && (
          <div><label className="label" htmlFor="au-ts">…a</label>
            <select id="au-ts" name="triggerStatus" className="input" defaultValue="in_review">
              <option value="">cualquier estado</option>{STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select></div>
        )}
        <div><label className="label" htmlFor="au-action">Entonces…</label>
          <select id="au-action" name="action" value={action} onChange={(e) => setAction(e.target.value)} className="input">
            <option value="notify_user">notificar a</option><option value="set_assignee">asignar a</option>
            <option value="set_priority">cambiar prioridad a</option><option value="set_status">mover al estado</option>
            <option value="add_checklist">añadir checklist</option><option value="add_comment">añadir comentario</option>
          </select></div>
        <div>
          <label className="label" htmlFor="au-value">Valor</label>
          {(action === "notify_user" || action === "set_assignee") && (
            <select id="au-value" name={`value_${action}`} required className="input" defaultValue=""><option value="" disabled>Elige persona…</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          )}
          {action === "set_priority" && <select id="au-value" name="value_set_priority" className="input"><option value="high">Alta</option><option value="medium">Media</option><option value="low">Baja</option></select>}
          {action === "set_status" && <select id="au-value" name="value_set_status" className="input">{STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}
          {action === "add_checklist" && <textarea id="au-value" name="value_add_checklist" required rows={3} placeholder={"Un elemento por línea\nRevisar ortografía\nValidar enlaces"} className="input" />}
          {action === "add_comment" && <textarea id="au-value" name="value_add_comment" required rows={2} placeholder="Texto del comentario" className="input" />}
        </div>
      </div>
      <div className="flex justify-end"><SubmitButton>Crear automatización</SubmitButton></div>
    </ActionForm>
  );
}
