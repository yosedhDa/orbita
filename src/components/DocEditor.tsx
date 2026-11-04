"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Bold, Italic, Heading1, Heading2, List, ListOrdered, ListChecks, Table, Quote, Code, Link2, Minus, Eye, Pencil, Columns2 } from "lucide-react";
import { saveDocument } from "@/actions/docs";

type Doc = { id: string; title: string; icon: string; content: string; category: string; visibility: string; project_id: string | null; version: number };

export function DocEditor({ workspaceId, doc, projects, previewHtml, canChangeVisibility }: {
  workspaceId: string; doc: Doc; projects: { id: string; name: string }[]; previewHtml: string; canChangeVisibility: boolean;
}) {
  const [title, setTitle] = useState(doc.title);
  const [icon, setIcon] = useState(doc.icon);
  const [content, setContent] = useState(doc.content);
  const [meta, setMeta] = useState({ category: doc.category, visibility: doc.visibility, projectId: doc.project_id ?? "" });
  const [version, setVersion] = useState(doc.version);
  const [status, setStatus] = useState<{ kind: "idle" | "saving" | "saved" | "error" | "conflict"; msg?: string }>({ kind: "idle" });
  const [mode, setMode] = useState<"edit" | "split" | "preview">("split");
  const [dirty, setDirty] = useState(false);
  const [, start] = useTransition();
  const ta = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Autoguardado tras 2,5 s sin escribir
  useEffect(() => {
    if (!dirty || status.kind === "conflict") return;
    const t = setTimeout(() => save(false), 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, icon, content, meta, dirty]);

  function save(force: boolean) {
    const fd = new FormData();
    fd.set("workspaceId", workspaceId); fd.set("documentId", doc.id); fd.set("title", title || "Sin título"); fd.set("icon", icon);
    fd.set("content", content); fd.set("category", meta.category); fd.set("visibility", meta.visibility); fd.set("projectId", meta.projectId);
    fd.set("baseVersion", String(version)); if (force) fd.set("force", "1");
    setStatus({ kind: "saving" });
    start(async () => {
      const r = await saveDocument(null, fd);
      if (r?.error) setStatus({ kind: r.data?.conflict ? "conflict" : "error", msg: r.error });
      else { setVersion(Number(r?.data?.version ?? version + 1)); setDirty(false); setStatus({ kind: "saved" }); router.refresh(); }
    });
  }
  const touch = () => setDirty(true);

  function wrap(before: string, after = before, placeholder = "texto") {
    const el = ta.current!;
    const s = el.selectionStart, e = el.selectionEnd;
    const sel = content.slice(s, e) || placeholder;
    const next = content.slice(0, s) + before + sel + after + content.slice(e);
    setContent(next); touch();
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + before.length, s + before.length + sel.length); });
  }
  function line(prefix: string) {
    const el = ta.current!;
    const s = el.selectionStart;
    const ls = content.lastIndexOf("\n", s - 1) + 1;
    setContent(content.slice(0, ls) + prefix + content.slice(ls)); touch();
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + prefix.length, s + prefix.length); });
  }
  function insert(block: string) {
    const el = ta.current!;
    const s = el.selectionStart;
    const pre = content.slice(0, s) + (s > 0 && content[s - 1] !== "\n" ? "\n\n" : "");
    setContent(pre + block + "\n" + content.slice(s)); touch();
    requestAnimationFrame(() => el.focus());
  }
  const tools = [
    { i: Bold, t: "Negrita", f: () => wrap("**") }, { i: Italic, t: "Cursiva", f: () => wrap("_") },
    { i: Heading1, t: "Título", f: () => line("# ") }, { i: Heading2, t: "Subtítulo", f: () => line("## ") },
    { i: List, t: "Lista", f: () => line("- ") }, { i: ListOrdered, t: "Lista numerada", f: () => line("1. ") },
    { i: ListChecks, t: "Lista de tareas", f: () => line("- [ ] ") }, { i: Quote, t: "Cita", f: () => line("> ") },
    { i: Code, t: "Código", f: () => wrap("`") }, { i: Link2, t: "Enlace", f: () => wrap("[", "](https://)", "enlace") },
    { i: Table, t: "Insertar tabla", f: () => insert("| Columna 1 | Columna 2 | Columna 3 |\n| --- | --- | --- |\n| Dato | Dato | Dato |\n| Dato | Dato | Dato |") },
    { i: Minus, t: "Separador", f: () => insert("---") },
  ];

  return (
    <div>
      <div className="mb-4 flex items-start gap-2">
        <input value={icon} onChange={(e) => { setIcon(e.target.value.slice(0, 4)); touch(); }} className="w-12 rounded-lg border-0 bg-transparent p-1 text-center text-3xl hover:bg-ink-100 focus:ring-2 focus:ring-brand-300" aria-label="Icono" />
        <input value={title} onChange={(e) => { setTitle(e.target.value); touch(); }} maxLength={200} placeholder="Sin título" aria-label="Título del documento"
          className="min-w-0 flex-1 rounded-lg border-0 bg-transparent px-1 text-2xl font-bold tracking-tight text-ink-900 focus:ring-0 sm:text-3xl" />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <select value={meta.projectId} onChange={(e) => { setMeta({ ...meta, projectId: e.target.value }); touch(); }} className="input w-auto py-1 text-xs" aria-label="Proyecto vinculado">
          <option value="">Sin proyecto vinculado</option>{projects.map((p) => <option key={p.id} value={p.id}>📁 {p.name}</option>)}
        </select>
        <input value={meta.category} onChange={(e) => { setMeta({ ...meta, category: e.target.value }); touch(); }} placeholder="Categoría" className="input w-36 py-1 text-xs" aria-label="Categoría" maxLength={60} />
        <select value={meta.visibility} disabled={!canChangeVisibility} onChange={(e) => { setMeta({ ...meta, visibility: e.target.value }); touch(); }} className="input w-auto py-1 text-xs" aria-label="Visibilidad">
          <option value="workspace">Visible para el espacio</option><option value="private">Privado (sólo yo y administradores)</option>
        </select>
        <span className="ml-auto flex items-center gap-2">
          <span data-testid="save-status" className={clsx("text-xs", status.kind === "error" || status.kind === "conflict" ? "text-rose-600" : "text-ink-400")}>
            {status.kind === "saving" ? "Guardando…" : status.kind === "saved" && !dirty ? "Guardado" : dirty ? "Cambios sin guardar" : ""}
          </span>
          <button type="button" className="btn-primary btn-sm px-3 py-1.5" onClick={() => save(false)} disabled={status.kind === "saving"}>Guardar</button>
        </span>
      </div>
      {(status.kind === "error" || status.kind === "conflict") && (
        <div className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
          {status.msg}
          {status.kind === "conflict" && (
            <span className="mt-2 flex gap-2"><button className="btn-secondary btn-sm" onClick={() => window.location.reload()}>Recargar (perder mis cambios)</button>
              <button className="btn-danger btn-sm" onClick={() => save(true)}>Sobrescribir con mi versión</button></span>
          )}
        </div>
      )}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-0.5 border-b border-ink-100 bg-ink-50/60 p-1.5">
          {tools.map((t) => <button key={t.t} type="button" title={t.t} aria-label={t.t} onClick={t.f} disabled={mode === "preview"} className="btn-ghost p-1.5"><t.i className="h-4 w-4" /></button>)}
          <span className="ml-auto flex gap-0.5 rounded-md bg-ink-100 p-0.5">
            {([["edit", Pencil, "Editar"], ["split", Columns2, "Dividido"], ["preview", Eye, "Vista previa"]] as const).map(([k, I, l]) => (
              <button key={k} type="button" onClick={() => setMode(k)} title={l} className={clsx("rounded p-1", mode === k ? "bg-white shadow-sm" : "text-ink-500", k === "split" && "hidden md:block")}><I className="h-4 w-4" /></button>
            ))}
          </span>
        </div>
        <div className={clsx("grid", mode === "split" && "md:grid-cols-2")}>
          {mode !== "preview" && (
            <textarea ref={ta} value={content} onChange={(e) => { setContent(e.target.value); touch(); }} aria-label="Contenido (Markdown)"
              placeholder={"Empieza a escribir… Admite Markdown: # títulos, - listas, - [ ] tareas, | tablas |"}
              className={clsx("min-h-[60vh] w-full resize-y border-0 p-4 font-mono text-sm leading-6 focus:ring-0", mode === "split" && "md:border-r md:border-ink-100")} />
          )}
          {mode !== "edit" && (
            <div className={clsx("min-h-[60vh] overflow-auto p-5", mode === "split" && "hidden md:block")}>
              {dirty ? <p className="mb-3 text-xs text-ink-400">La vista previa se actualiza al guardar.</p> : null}
              <div className="prose-doc" dangerouslySetInnerHTML={{ __html: previewHtml || "<p class='text-ink-400'>Documento vacío.</p>" }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
