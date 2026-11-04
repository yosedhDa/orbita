"use client";
import { useState } from "react";
import { updateTask } from "@/actions/tasks";
import { ActionForm, SubmitButton } from "./forms";
import { Avatar } from "./ui";

type M = { id: string; name: string; avatar_color: string };
type T = { id: string; title: string; description: string; status: string; priority: string; assignee_id: string | null; due_date: string | null; start_date: string | null };

export function TaskEditor({ workspaceId, task, members, collaborators, readOnly }: { workspaceId: string; task: T; members: M[]; collaborators: string[]; readOnly: boolean }) {
  const [collab, setCollab] = useState<string[]>(collaborators);
  const [dirty, setDirty] = useState(false);
  return (
    <ActionForm action={updateTask} hidden={{ workspaceId, taskId: task.id, collaboratorsSent: "1" }} onSuccess={() => setDirty(false)}>
      <fieldset disabled={readOnly} onChange={() => setDirty(true)} className="space-y-4">
        <input name="title" defaultValue={task.title} required maxLength={300} aria-label="Título"
          className="w-full rounded-lg border-0 px-0 text-lg font-semibold text-ink-900 focus:ring-0 disabled:bg-transparent" />
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label" htmlFor="te-status">Estado</label>
            <select id="te-status" name="status" defaultValue={task.status} className="input">
              <option value="pending">Pendiente</option><option value="in_progress">En progreso</option><option value="in_review">En revisión</option><option value="done">Completada</option>
            </select></div>
          <div><label className="label" htmlFor="te-prio">Prioridad</label>
            <select id="te-prio" name="priority" defaultValue={task.priority} className="input">
              <option value="high">Alta</option><option value="medium">Media</option><option value="low">Baja</option>
            </select></div>
          <div><label className="label" htmlFor="te-assignee">Responsable</label>
            <select id="te-assignee" name="assigneeId" defaultValue={task.assignee_id ?? ""} className="input">
              <option value="">Sin responsable</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select></div>
          <div><label className="label" htmlFor="te-due">Fecha límite</label><input id="te-due" type="date" name="dueDate" defaultValue={task.due_date ?? ""} className="input" /></div>
          <div><label className="label" htmlFor="te-start">Fecha de inicio</label><input id="te-start" type="date" name="startDate" defaultValue={task.start_date ?? ""} className="input" /></div>
        </div>
        <div>
          <p className="label">Colaboradores</p>
          <div className="flex flex-wrap gap-1.5">
            {members.map((m) => {
              const on = collab.includes(m.id);
              return (
                <label key={m.id} className={`flex cursor-pointer items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 text-xs ring-1 ${on ? "bg-brand-50 text-brand-700 ring-brand-200" : "text-ink-600 ring-ink-200 hover:bg-ink-50"}`}>
                  <input type="checkbox" name="collaborators" value={m.id} checked={on} className="sr-only"
                    onChange={() => { setCollab(on ? collab.filter((c) => c !== m.id) : [...collab, m.id]); setDirty(true); }} />
                  <Avatar name={m.name} color={m.avatar_color} size={20} className="!ring-0" />{m.name.split(" ")[0]}
                </label>
              );
            })}
          </div>
        </div>
        <div><label className="label" htmlFor="te-desc">Descripción</label>
          <textarea id="te-desc" name="description" rows={4} defaultValue={task.description} maxLength={10000} className="input" placeholder="Añade detalles, criterios de aceptación…" /></div>
        {!readOnly && <div className="flex items-center justify-end gap-3">{dirty && <span className="text-xs text-amber-600">Cambios sin guardar</span>}<SubmitButton>Guardar cambios</SubmitButton></div>}
      </fieldset>
    </ActionForm>
  );
}
