import { FileIcon, Trash2, Download } from "lucide-react";
import { deleteAttachment, deleteComment } from "@/actions/collab";
import { listAttachments, listComments, type ActivityItem } from "@/lib/queries";
import { ActionButton } from "./forms";
import { CommentForm } from "./CommentForm";
import { UploadButton } from "./Upload";
import { Avatar, RichText, fileSize, timeAgo } from "./ui";

type Ctx = { workspaceId: string; userId: string; isAdmin: boolean };

export async function Comments({ ctx, type, id, canComment, members }: { ctx: Ctx; type: string; id: string; canComment: boolean; members: { id: string; name: string; avatar_color: string }[] }) {
  const comments = await listComments(type, id);
  return (
    <div>
      {comments.length === 0 && <p className="mb-3 text-sm text-ink-500">Sin comentarios todavía.</p>}
      <ul className="mb-4 space-y-4">
        {comments.map((c) => (
          <li key={c.id} className="group flex gap-3">
            <Avatar name={c.author_name} color={c.author_color} size={28} />
            <div className="min-w-0 flex-1">
              <p className="text-sm"><b className="font-medium">{c.author_name ?? "Usuario eliminado"}</b> <span className="text-xs text-ink-400">{timeAgo(c.created_at)}</span></p>
              <p className="mt-0.5 text-sm text-ink-700"><RichText text={c.body} /></p>
            </div>
            {(c.author_id === ctx.userId || ctx.isAdmin) && (
              <div className="opacity-0 transition group-hover:opacity-100">
                <ActionButton action={deleteComment} hidden={{ workspaceId: ctx.workspaceId, commentId: c.id }} confirm="¿Eliminar este comentario?" title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></ActionButton>
              </div>
            )}
          </li>
        ))}
      </ul>
      {canComment ? <CommentForm workspaceId={ctx.workspaceId} entityType={type} entityId={id} members={members} />
        : <p className="text-xs text-ink-400">Tienes acceso de sólo lectura.</p>}
    </div>
  );
}

export async function Attachments({ ctx, type, id, canEdit }: { ctx: Ctx; type: string; id: string; canEdit: boolean }) {
  const files = await listAttachments(type, id);
  return (
    <div>
      {files.length === 0 && <p className="mb-3 text-sm text-ink-500">Sin archivos adjuntos.</p>}
      <ul className="mb-3 space-y-1.5">
        {files.map((f) => (
          <li key={f.id} className="flex items-center gap-3 rounded-lg p-2 ring-1 ring-ink-100">
            <FileIcon className="h-5 w-5 shrink-0 text-ink-400" />
            <a href={`/api/attachments/${f.id}`} target="_blank" rel="noopener" className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium hover:underline">{f.filename}</span>
              <span className="block text-xs text-ink-400">{fileSize(f.size_bytes)} · {f.uploader ?? "—"} · {timeAgo(f.created_at)}</span>
            </a>
            <a href={`/api/attachments/${f.id}`} download className="btn-ghost btn-sm" aria-label="Descargar"><Download className="h-3.5 w-3.5" /></a>
            {(canEdit || f.uploaded_by === ctx.userId) && (
              <ActionButton action={deleteAttachment} hidden={{ workspaceId: ctx.workspaceId, attachmentId: f.id }} confirm={`¿Eliminar «${f.filename}»?`} title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></ActionButton>
            )}
          </li>
        ))}
      </ul>
      {canEdit && <UploadButton workspaceId={ctx.workspaceId} entityType={type} entityId={id} />}
    </div>
  );
}

export function ActivityList({ items, empty = "Sin actividad." }: { items: ActivityItem[]; empty?: string }) {
  if (!items.length) return <p className="text-sm text-ink-500">{empty}</p>;
  return (
    <ul className="space-y-3">
      {items.map((a) => (
        <li key={a.id} className="flex items-start gap-2.5 text-sm">
          <Avatar name={a.actor_name} color={a.actor_color} size={22} />
          <p className="min-w-0 flex-1 text-ink-600"><b className="font-medium text-ink-800">{a.actor_name ?? "Alguien"}</b> {a.summary}
            <span className="ml-1 text-xs text-ink-400">· {timeAgo(a.created_at)}</span></p>
        </li>
      ))}
    </ul>
  );
}
