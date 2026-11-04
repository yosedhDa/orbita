"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";

export function UploadButton({ workspaceId, entityType, entityId }: { workspaceId: string; entityType: string; entityId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    for (const f of Array.from(files)) {
      const fd = new FormData();
      fd.set("workspaceId", workspaceId);
      fd.set("entityType", entityType);
      fd.set("entityId", entityId);
      fd.set("file", f);
      const r = await fetch("/api/attachments", { method: "POST", body: fd });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(`${f.name}: ${j.error ?? "error al subir"}`);
      }
    }
    setBusy(false);
    if (input.current) input.current.value = "";
    router.refresh();
  }
  return (
    <div>
      <input ref={input} type="file" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} data-testid="file-input" />
      <button type="button" className="btn-secondary btn-sm px-2.5 py-1.5" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Adjuntar archivo
      </button>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
