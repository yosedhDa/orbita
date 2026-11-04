"use client";
import { useRef, useState } from "react";
import { addComment } from "@/actions/collab";
import { ActionForm, SubmitButton } from "./forms";
import { Avatar } from "./ui";

type M = { id: string; name: string; avatar_color: string };

/** Comentario con menciones: al escribir "@" se sugieren personas y se inserta @[Nombre](id). */
export function CommentForm({ workspaceId, entityType, entityId, members }: { workspaceId: string; entityType: string; entityId: string; members: M[] }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [hl, setHl] = useState(0);
  const matches = query === null ? [] : members.filter((m) => m.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6);

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setValue(v);
    const caret = e.target.selectionStart;
    const m = v.slice(0, caret).match(/(?:^|\s)@([\p{L}\w.\- ]{0,30})$/u);
    setQuery(m && !m[1].includes("  ") ? m[1] : null);
    setHl(0);
  }
  function pick(m: M) {
    const el = ref.current!;
    const caret = el.selectionStart;
    const before = value.slice(0, caret).replace(/@([\p{L}\w.\- ]{0,30})$/u, `@[${m.name}](${m.id}) `);
    const next = before + value.slice(caret);
    setValue(next);
    setQuery(null);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(before.length, before.length); });
  }
  return (
    <ActionForm action={addComment} hidden={{ workspaceId, entityType, entityId }} onSuccess={() => setValue("")}>
      <div className="relative">
        <textarea ref={ref} name="body" required rows={2} value={value} onChange={onChange} maxLength={5000}
          onKeyDown={(e) => {
            if (!matches.length) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setHl((h) => (h + 1) % matches.length); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHl((h) => (h - 1 + matches.length) % matches.length); }
            else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(matches[hl]); }
            else if (e.key === "Escape") setQuery(null);
          }}
          placeholder="Escribe un comentario… usa @ para mencionar" className="input resize-y" aria-label="Comentario" />
        {matches.length > 0 && (
          <ul className="absolute bottom-full left-0 z-20 mb-1 w-64 rounded-lg bg-white p-1 shadow-lg ring-1 ring-ink-200" role="listbox">
            {matches.map((m, i) => (
              <li key={m.id}>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); pick(m); }}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${i === hl ? "bg-brand-50" : "hover:bg-ink-50"}`}>
                  <Avatar name={m.name} color={m.avatar_color} size={20} /> {m.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-2 flex justify-end"><SubmitButton className="btn-primary btn-sm px-3 py-1.5">Comentar</SubmitButton></div>
    </ActionForm>
  );
}
