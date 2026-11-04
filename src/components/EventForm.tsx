"use client";
import { useEffect, useState } from "react";
import { ActionForm, SubmitButton, type FormAction } from "./forms";

export function EventForm({ action, workspaceId, projects, fixedProject, defaultDate }: { action: FormAction; workspaceId: string; projects: { id: string; name: string }[]; fixedProject?: boolean; defaultDate?: string }) {
  const [kind, setKind] = useState("meeting");
  const [tz, setTz] = useState("0");
  useEffect(() => setTz(String(new Date().getTimezoneOffset())), []);
  return (
    <ActionForm action={action} hidden={{ workspaceId, tz, projectId: fixedProject ? projects[0]?.id : undefined }} resetOnSuccess className="space-y-3">
      <div className="flex gap-2">
        {[["meeting", "📅 Reunión"], ["milestone", "🏁 Hito"]].map(([k, l]) => (
          <label key={k} className={`flex-1 cursor-pointer rounded-lg px-3 py-2 text-center text-sm ring-1 ${kind === k ? "bg-brand-50 text-brand-700 ring-brand-300" : "ring-ink-200"}`}>
            <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />{l}
          </label>
        ))}
      </div>
      <div><label className="label" htmlFor="ev-title">Título</label><input id="ev-title" name="title" required minLength={2} className="input" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor="ev-date">Fecha</label><input id="ev-date" type="date" name="date" required defaultValue={defaultDate} className="input" /></div>
        {kind === "meeting" && <div><label className="label" htmlFor="ev-time">Hora</label><input id="ev-time" type="time" name="time" defaultValue="09:00" className="input" /></div>}
        {kind === "meeting" && <div><label className="label" htmlFor="ev-dur">Duración</label>
          <select id="ev-dur" name="duration" defaultValue="60" className="input"><option value="30">30 min</option><option value="60">1 h</option><option value="90">1 h 30</option><option value="120">2 h</option></select></div>}
        {!fixedProject && (
          <div className={kind === "meeting" ? "" : "col-span-1"}><label className="label" htmlFor="ev-proj">Proyecto</label>
            <select id="ev-proj" name="projectId" className="input" defaultValue=""><option value="">General</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        )}
      </div>
      <div><label className="label" htmlFor="ev-desc">Descripción</label><textarea id="ev-desc" name="description" rows={2} className="input" /></div>
      <div className="flex justify-end"><SubmitButton>Guardar</SubmitButton></div>
    </ActionForm>
  );
}
