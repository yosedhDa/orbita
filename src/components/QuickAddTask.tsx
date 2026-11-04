"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { createTask } from "@/actions/tasks";
import { ActionForm, SubmitButton } from "./forms";

export function QuickAddTask({ workspaceId, projects, members, status = "pending", compact, parentId, defaultAssignee }: {
  workspaceId: string;
  projects: { id: string; name: string }[];
  members: { id: string; name: string }[];
  status?: string;
  compact?: boolean;
  parentId?: string;
  defaultAssignee?: string;
}) {
  const [open, setOpen] = useState(!compact);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-ink-500 hover:bg-white hover:text-ink-800">
        <Plus className="h-4 w-4" /> Añadir tarea
      </button>
    );
  return (
    <ActionForm action={createTask} resetOnSuccess hidden={{ workspaceId, status, parentId, projectId: projects.length === 1 ? projects[0].id : undefined }}
      className={compact ? "rounded-lg bg-white p-2 shadow-card ring-1 ring-ink-200" : "card p-3"}>
      <div className={compact ? "space-y-2" : "flex flex-wrap items-center gap-2"}>
        <input name="title" required maxLength={300} autoFocus={compact} placeholder={parentId ? "Nueva subtarea…" : "Nueva tarea…"} className="input min-w-[180px] flex-1" aria-label="Título de la tarea" />
        {projects.length > 1 && (
          <select name="projectId" required className="input w-full sm:w-44" aria-label="Proyecto" defaultValue="">
            <option value="" disabled>Proyecto…</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <div className="flex flex-wrap gap-2">
          <select name="assigneeId" className="input w-auto" aria-label="Responsable" defaultValue={defaultAssignee ?? ""}>
            <option value="">Sin responsable</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <select name="priority" defaultValue="medium" className="input w-auto" aria-label="Prioridad">
            <option value="high">Alta</option><option value="medium">Media</option><option value="low">Baja</option>
          </select>
          <input type="date" name="dueDate" className="input w-auto" aria-label="Fecha límite" />
        </div>
        <div className="flex gap-2">
          <SubmitButton className="btn-primary">Añadir</SubmitButton>
          {compact && <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>}
        </div>
      </div>
    </ActionForm>
  );
}
