import Link from "next/link";
import { notFound } from "next/navigation";
import { History, Trash2 } from "lucide-react";
import { documentLevel, getWsContext } from "@/lib/access";
import { sql } from "@/lib/db";
import { listDocs } from "@/lib/docs";
import { visibleMembers } from "@/lib/queries";
import { renderMarkdown } from "@/lib/markdown";
import { deleteDocument, moveDocument, renameFolder } from "@/actions/docs";
import { DocTree } from "@/components/DocTree";
import { DocEditor } from "@/components/DocEditor";
import { Attachments, Comments } from "@/components/Collab";
import { PublicLinks } from "@/components/SharePanel";
import { ActionForm, SubmitButton } from "@/components/forms";
import { timeAgo } from "@/components/ui";

export default async function DocPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await getWsContext(slug);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const level = await documentLevel(ctx.user.id, id);
  if (level < 1) notFound();
  const base = `/w/${slug}`;
  const [[doc], docs, projects, members] = await Promise.all([
    sql<{ id: string; title: string; icon: string; content: string; category: string; visibility: string; project_id: string | null; task_id: string | null; task_title: string | null;
      version: number; is_folder: boolean; parent_id: string | null; created_by: string | null; updated_at: Date; editor: string | null; author: string | null }[]>`
      select d.*, t.title as task_title, ue.name as editor, ua.name as author from documents d left join tasks t on t.id = d.task_id
      left join users ue on ue.id = d.updated_by left join users ua on ua.id = d.created_by where d.id = ${id} and d.workspace_id = ${ctx.ws.id}`,
    listDocs(ctx),
    sql<{ id: string; name: string }[]>`select id, name from projects where workspace_id = ${ctx.ws.id} and project_access_level(${ctx.user.id}, id) >= 2 order by name`,
    visibleMembers(ctx),
  ]);
  if (!doc) notFound();
  const canEdit = level >= 2;
  const w = { workspaceId: ctx.ws.id, userId: ctx.user.id, isAdmin: ctx.role === "admin" };
  const folders = docs.filter((d) => d.is_folder && d.id !== id && d.level >= 2);

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="card hidden h-fit p-3 lg:block"><DocTree docs={docs} base={base} workspaceId={ctx.ws.id} activeId={id} canCreate={ctx.role !== "guest"} /></aside>
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-ink-500">
          <Link href={`${base}/docs`} className="hover:underline">Documentos</Link><span>/</span><span className="truncate">{doc.title}</span>
          <span className="ml-auto">Creado por {doc.author ?? "—"} · editado {timeAgo(doc.updated_at)}{doc.editor && ` por ${doc.editor}`} · v{doc.version}</span>
          <Link href={`${base}/docs/${id}/history`} className="btn-ghost btn-sm"><History className="h-3.5 w-3.5" />Historial</Link>
        </div>
        {doc.task_id && doc.task_title && doc.project_id && (
          <p className="mb-3 text-sm text-ink-500">Vinculado a la tarea <Link className="text-brand-600 hover:underline" href={`${base}/projects/${doc.project_id}?task=${doc.task_id}`}>{doc.task_title}</Link></p>
        )}

        {doc.is_folder ? (
          <div className="card p-5">
            <h1 className="h-page mb-4">{doc.icon} {doc.title}</h1>
            {canEdit && (
              <ActionForm action={renameFolder} hidden={{ workspaceId: ctx.ws.id, documentId: id }} className="flex gap-2">
                <input name="title" defaultValue={doc.title} className="input" aria-label="Nombre de la carpeta" /><SubmitButton className="btn-secondary">Renombrar</SubmitButton>
              </ActionForm>
            )}
          </div>
        ) : canEdit ? (
          <DocEditor workspaceId={ctx.ws.id} doc={doc} projects={projects} previewHtml={renderMarkdown(doc.content)}
            canChangeVisibility={doc.created_by === ctx.user.id || ctx.role === "admin"} />
        ) : (
          <article className="card p-6">
            <h1 className="mb-4 text-3xl font-bold tracking-tight">{doc.icon} {doc.title}</h1>
            <div className="prose-doc" dangerouslySetInnerHTML={{ __html: renderMarkdown(doc.content) }} />
            <p className="mt-6 text-xs text-ink-400">Sólo lectura</p>
          </article>
        )}

        {!doc.is_folder && (
          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <section className="card p-5"><h2 className="mb-4 font-semibold">Comentarios</h2><Comments ctx={w} type="document" id={id} canComment={ctx.role === "guest" ? canEdit : true} members={members} /></section>
            <div className="space-y-6">
              <section className="card p-5"><h2 className="mb-4 font-semibold">Archivos adjuntos</h2><Attachments ctx={w} type="document" id={id} canEdit={canEdit} /></section>
              {canEdit && ctx.role !== "guest" && (
                <section className="card p-5"><h2 className="mb-2 font-semibold">Compartir mediante enlace</h2><PublicLinks workspaceId={ctx.ws.id} type="document" id={id} canManage /></section>
              )}
              {canEdit && (
                <section className="card p-5">
                  <h2 className="mb-3 font-semibold">Organizar</h2>
                  <ActionForm action={moveDocument} hidden={{ workspaceId: ctx.ws.id, documentId: id }} className="flex gap-2">
                    <select name="parentId" defaultValue={doc.parent_id ?? ""} className="input" aria-label="Carpeta"><option value="">Raíz (sin carpeta)</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.icon} {f.title}</option>)}</select>
                    <SubmitButton className="btn-secondary">Mover</SubmitButton>
                  </ActionForm>
                  <ActionForm action={deleteDocument} hidden={{ workspaceId: ctx.ws.id, documentId: id, redirect: "1" }} confirm="¿Eliminar este documento? Se perderá su historial." className="mt-4">
                    <SubmitButton className="btn-danger btn-sm px-2.5 py-1.5"><Trash2 className="h-3.5 w-3.5" />Eliminar documento</SubmitButton>
                  </ActionForm>
                </section>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
