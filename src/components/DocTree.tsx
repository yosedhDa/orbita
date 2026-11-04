import Link from "next/link";
import clsx from "clsx";
import { FilePlus, FolderPlus, Trash2 } from "lucide-react";
import { createDocument, deleteDocument } from "@/actions/docs";
import { ActionButton, ActionForm, SubmitButton } from "./forms";

export type DocNode = { id: string; parent_id: string | null; title: string; icon: string; is_folder: boolean; level: number; category: string; updated_at: Date; project_name: string | null; visibility: string };

export function DocTree({ docs, base, workspaceId, activeId, canCreate }: { docs: DocNode[]; base: string; workspaceId: string; activeId?: string; canCreate: boolean }) {
  const ids = new Set(docs.map((d) => d.id));
  // Documentos cuyo padre no es visible se muestran en la raíz
  const roots = docs.filter((d) => !d.parent_id || !ids.has(d.parent_id));
  const children = (id: string) => docs.filter((d) => d.parent_id === id);
  const sort = (a: DocNode, b: DocNode) => Number(b.is_folder) - Number(a.is_folder) || a.title.localeCompare(b.title);

  function Node({ d, depth }: { d: DocNode; depth: number }) {
    const kids = children(d.id).sort(sort);
    if (d.is_folder) {
      return (
        <li>
          <details open className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md px-2 py-1 text-sm text-ink-700 hover:bg-ink-100" style={{ paddingLeft: 8 + depth * 12 }}>
              <span className="text-xs text-ink-400 transition group-open:rotate-90">▸</span><span>{d.icon}</span><span className="flex-1 truncate font-medium">{d.title}</span>
              {d.level >= 2 && (
                <span className="flex opacity-0 group-hover:opacity-100">
                  <ActionButton action={createDocument} hidden={{ workspaceId, parentId: d.id, isFolder: "0" }} title="Nuevo documento en la carpeta"><FilePlus className="h-3.5 w-3.5" /></ActionButton>
                  <ActionButton action={deleteDocument} hidden={{ workspaceId, documentId: d.id }} confirm={`¿Eliminar la carpeta «${d.title}» y todo su contenido?`} title="Eliminar carpeta"><Trash2 className="h-3.5 w-3.5" /></ActionButton>
                </span>
              )}
            </summary>
            <ul>{kids.map((k) => <Node key={k.id} d={k} depth={depth + 1} />)}{kids.length === 0 && <li className="py-1 text-xs text-ink-400" style={{ paddingLeft: 28 + depth * 12 }}>Vacía</li>}</ul>
          </details>
        </li>
      );
    }
    return (
      <li>
        <Link href={`${base}/docs/${d.id}`} className={clsx("flex items-center gap-1.5 rounded-md px-2 py-1 text-sm hover:bg-ink-100", activeId === d.id ? "bg-brand-50 font-medium text-brand-700" : "text-ink-600")} style={{ paddingLeft: 20 + depth * 12 }}>
          <span>{d.icon}</span><span className="truncate">{d.title}</span>
        </Link>
        {kids.length > 0 && <ul>{kids.sort(sort).map((k) => <Node key={k.id} d={k} depth={depth + 1} />)}</ul>}
      </li>
    );
  }

  return (
    <div>
      {canCreate && (
        <div className="mb-3 flex gap-2">
          <ActionForm action={createDocument} hidden={{ workspaceId, isFolder: "0" }} className="flex-1"><SubmitButton className="btn-primary btn-sm w-full py-1.5"><FilePlus className="h-3.5 w-3.5" />Página</SubmitButton></ActionForm>
          <ActionForm action={createDocument} hidden={{ workspaceId, isFolder: "1", title: "Nueva carpeta" }} className="flex-1"><SubmitButton className="btn-secondary btn-sm w-full py-1.5"><FolderPlus className="h-3.5 w-3.5" />Carpeta</SubmitButton></ActionForm>
        </div>
      )}
      <ul className="space-y-0.5">{roots.sort(sort).map((d) => <Node key={d.id} d={d} depth={0} />)}</ul>
      {docs.length === 0 && <p className="px-2 text-xs text-ink-400">Sin documentos todavía.</p>}
    </div>
  );
}
