"use client";
import { useState } from "react";
import { saveGoal } from "@/actions/stage3";
import { ActionForm, Modal, SubmitButton } from "./forms";

type Opt = { id: string; name: string };
export type GoalInitial = {
  id?: string; title?: string; description?: string; owner_id?: string | null; team_id?: string | null; metric_type?: string;
  target_value?: number; unit?: string; start_date?: string | null; due_date?: string | null; project_ids?: string[];
};

export function GoalForm({ workspaceId, members, teams, projects, initial = {}, onDone }: { workspaceId: string; members: Opt[]; teams: Opt[]; projects: Opt[]; initial?: GoalInitial; onDone?: () => void }) {
  const [metric, setMetric] = useState(initial.metric_type ?? "manual");
  return (
    <ActionForm action={saveGoal} hidden={{ workspaceId, goalId: initial.id }} onSuccess={() => onDone?.()} className="space-y-3">
      <div><label className="label" htmlFor="g-title">Objetivo</label><input id="g-title" name="title" required minLength={2} defaultValue={initial.title} placeholder="Ej. Aumentar leads calificados" className="input" /></div>
      <div><label className="label" htmlFor="g-desc">Descripción</label><textarea id="g-desc" name="description" rows={2} defaultValue={initial.description} className="input" /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="g-metric">Cómo se mide</label>
          <select id="g-metric" name="metricType" value={metric} onChange={(e) => setMetric(e.target.value)} className="input">
            <option value="manual">Valor manual (KPI)</option><option value="project_progress">Avance de proyectos vinculados (%)</option><option value="tasks_completed">Tareas completadas en el periodo</option>
          </select></div>
        <div className="flex gap-2">
          <div className="flex-1"><label className="label" htmlFor="g-target">Meta</label><input id="g-target" name="targetValue" type="number" step="any" min="0.01" required defaultValue={initial.target_value ?? (metric === "project_progress" ? 100 : "")} className="input" /></div>
          {metric === "manual" && <div className="w-24"><label className="label" htmlFor="g-unit">Unidad</label><input id="g-unit" name="unit" defaultValue={initial.unit ?? ""} placeholder="leads, $, %" className="input" maxLength={20} /></div>}
        </div>
        <div><label className="label" htmlFor="g-owner">Responsable</label>
          <select id="g-owner" name="ownerId" defaultValue={initial.owner_id ?? ""} className="input"><option value="">Yo</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
        <div><label className="label" htmlFor="g-team">Equipo</label>
          <select id="g-team" name="teamId" defaultValue={initial.team_id ?? ""} className="input"><option value="">Sin equipo</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        <div><label className="label" htmlFor="g-start">Inicio</label><input id="g-start" type="date" name="startDate" defaultValue={initial.start_date ?? ""} className="input" /></div>
        <div><label className="label" htmlFor="g-due">Fecha objetivo</label><input id="g-due" type="date" name="dueDate" defaultValue={initial.due_date ?? ""} className="input" /></div>
      </div>
      <fieldset>
        <legend className="label">Proyectos vinculados {metric !== "manual" && <span className="text-rose-600">*</span>}</legend>
        <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg p-2 ring-1 ring-ink-200">
          {projects.length === 0 && <p className="text-xs text-ink-400">No hay proyectos.</p>}
          {projects.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="projectIds" value={p.id} defaultChecked={initial.project_ids?.includes(p.id)} className="rounded border-ink-300" />{p.name}</label>
          ))}
        </div>
      </fieldset>
      <div className="flex justify-end"><SubmitButton>{initial.id ? "Guardar" : "Crear objetivo"}</SubmitButton></div>
    </ActionForm>
  );
}

/** Botón + diálogo con el formulario de objetivo (se cierra al guardar). */
export function GoalDialog({ trigger, triggerClassName, title, ...props }: Omit<Parameters<typeof GoalForm>[0], "onDone"> & { trigger: string; triggerClassName?: string; title: string }) {
  return (
    <Modal title={title} trigger={trigger} triggerClassName={triggerClassName} wide>
      {(close) => <GoalForm {...props} onDone={close} />}
    </Modal>
  );
}
