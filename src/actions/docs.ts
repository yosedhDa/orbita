"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { safeAction, UserError } from "@/lib/action";
import { AccessError, LEVEL, canSeeDirectory, requireDocument, requireProject, requireTask, wsContextById } from "@/lib/access";
import { logActivity } from "@/lib/events";

const uuid = z.string().uuid();
const optUuid = z.preprocess((v) => (v ? v : null), uuid.nullable());

export const createDocument = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  const d = z.object({
    parentId: optUuid, projectId: optUuid, taskId: optUuid,
    isFolder: z.boolean(),
    title: z.string().trim().max(200).default(""),
  }).parse({ parentId: fd.get("parentId"), projectId: fd.get("projectId"), taskId: fd.get("taskId"), isFolder: fd.get("isFolder") === "1", title: fd.get("title") ?? "" });
  if (d.projectId) await requireProject(ctx, d.projectId, LEVEL.edit);
  else if (!canSeeDirectory(ctx.role)) throw new AccessError("Los invitados sólo pueden crear documentos dentro de proyectos compartidos con edición");
  if (d.taskId) await requireTask(ctx, d.taskId, LEVEL.edit);
  if (d.parentId) {
    const p = await requireDocument(ctx, d.parentId, LEVEL.edit);
    if (!p) throw new AccessError();
  }
  const title = d.title || (d.isFolder ? "Nueva carpeta" : "Sin título");
  const [doc] = await sql<{ id: string }[]>`insert into documents (workspace_id, parent_id, is_folder, title, icon, project_id, task_id, created_by, updated_by)
    values (${ctx.ws.id}, ${d.parentId}, ${d.isFolder}, ${title}, ${d.isFolder ? "📁" : "📄"}, ${d.projectId}, ${d.taskId}, ${ctx.user.id}, ${ctx.user.id}) returning id`;
  await logActivity({ workspaceId: ctx.ws.id, projectId: d.projectId, actorId: ctx.user.id, entityType: "document", entityId: doc.id, action: "document.created", summary: `creó ${d.isFolder ? "la carpeta" : "el documento"} «${title}»` });
  revalidatePath(`/w/${ctx.ws.slug}/docs`, "layout");
  if (d.isFolder) return { ok: true };
  redirect(`/w/${ctx.ws.slug}/docs/${doc.id}`);
});

export const saveDocument = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  const id = uuid.parse(fd.get("documentId"));
  await requireDocument(ctx, id, LEVEL.edit);
  const d = z.object({
    title: z.string().trim().min(1, "Escribe un título").max(200),
    icon: z.string().max(8).default("📄"),
    content: z.string().max(500_000, "El documento es demasiado grande"),
    category: z.string().trim().max(60).default(""),
    visibility: z.enum(["workspace", "private"]),
    projectId: optUuid,
    baseVersion: z.coerce.number().int(),
    force: z.boolean(),
  }).parse({
    title: fd.get("title"), icon: fd.get("icon") || undefined, content: fd.get("content") ?? "", category: fd.get("category") ?? "",
    visibility: fd.get("visibility") ?? "workspace", projectId: fd.get("projectId"), baseVersion: fd.get("baseVersion"), force: fd.get("force") === "1",
  });
  const [cur] = await sql<{ version: number; title: string; content: string; project_id: string | null; created_by: string | null; visibility: string }[]>`
    select version, title, content, project_id, created_by, visibility from documents where id = ${id}`;
  if (cur.version !== d.baseVersion && !d.force) {
    return { error: "Otra persona guardó cambios mientras editabas. Recarga para ver la última versión o guarda de todos modos para sobrescribir.", data: { conflict: true } };
  }
  if (d.projectId !== cur.project_id) {
    // Mover un documento fuera de un proyecto puede ampliar quién lo ve: requiere administrar el proyecto original
    if (cur.project_id) await requireProject(ctx, cur.project_id, LEVEL.admin);
    if (d.projectId) await requireProject(ctx, d.projectId, LEVEL.edit);
  }
  if (d.visibility !== cur.visibility && cur.created_by !== ctx.user.id && ctx.role !== "admin")
    throw new AccessError("Sólo el autor o un administrador puede cambiar la visibilidad");
  if (cur.title === d.title && cur.content === d.content) {
    await sql`update documents set icon = ${d.icon}, category = ${d.category}, visibility = ${d.visibility}, project_id = ${d.projectId} where id = ${id}`;
  } else {
    await sql.begin(async (tx) => {
      await tx`insert into document_versions (document_id, version, title, content, author_id) values (${id}, ${cur.version}, ${cur.title}, ${cur.content}, ${ctx.user.id})`;
      await tx`update documents set title = ${d.title}, icon = ${d.icon}, content = ${d.content}, category = ${d.category}, visibility = ${d.visibility},
        project_id = ${d.projectId}, version = version + 1, updated_by = ${ctx.user.id}, updated_at = now() where id = ${id}`;
    });
    await logActivity({ workspaceId: ctx.ws.id, projectId: d.projectId, actorId: ctx.user.id, entityType: "document", entityId: id, action: "document.updated", summary: `editó el documento «${d.title}»` });
  }
  revalidatePath(`/w/${ctx.ws.slug}/docs`, "layout");
  const [{ version }] = await sql<{ version: number }[]>`select version from documents where id = ${id}`;
  return { ok: true, message: "Guardado", data: { version } };
});

export const renameFolder = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  const id = uuid.parse(fd.get("documentId"));
  await requireDocument(ctx, id, LEVEL.edit);
  const title = z.string().trim().min(1).max(200).parse(fd.get("title"));
  await sql`update documents set title = ${title}, updated_at = now() where id = ${id}`;
  revalidatePath(`/w/${ctx.ws.slug}/docs`, "layout");
});

export const moveDocument = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  const id = uuid.parse(fd.get("documentId"));
  await requireDocument(ctx, id, LEVEL.edit);
  const parentId = optUuid.parse(fd.get("parentId"));
  if (parentId) {
    await requireDocument(ctx, parentId, LEVEL.edit);
    // Evitar ciclos
    const cyc = await sql`with recursive up as (select id, parent_id from documents where id = ${parentId}
      union all select d.id, d.parent_id from documents d join up on d.id = up.parent_id) select 1 from up where id = ${id}`;
    if (cyc.length) throw new UserError("No puedes mover una carpeta dentro de sí misma");
  }
  await sql`update documents set parent_id = ${parentId} where id = ${id}`;
  revalidatePath(`/w/${ctx.ws.slug}/docs`, "layout");
});

export const restoreVersion = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  const id = uuid.parse(fd.get("documentId"));
  await requireDocument(ctx, id, LEVEL.edit);
  const versionId = uuid.parse(fd.get("versionId"));
  const [v] = await sql<{ title: string; content: string; version: number }[]>`select title, content, version from document_versions where id = ${versionId} and document_id = ${id}`;
  if (!v) throw new AccessError();
  await sql.begin(async (tx) => {
    await tx`insert into document_versions (document_id, version, title, content, author_id)
      select id, version, title, content, ${ctx.user.id} from documents where id = ${id}`;
    await tx`update documents set title = ${v.title}, content = ${v.content}, version = version + 1, updated_by = ${ctx.user.id}, updated_at = now() where id = ${id}`;
  });
  await logActivity({ workspaceId: ctx.ws.id, actorId: ctx.user.id, entityType: "document", entityId: id, action: "document.restored", summary: `restauró la versión ${v.version} de «${v.title}»` });
  redirect(`/w/${ctx.ws.slug}/docs/${id}`);
});

export const deleteDocument = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  const id = uuid.parse(fd.get("documentId"));
  const d = await requireDocument(ctx, id, LEVEL.edit);
  const [{ n }] = await sql<{ n: number }[]>`with recursive tree as (select id from documents where id = ${id}
    union all select c.id from documents c join tree on c.parent_id = tree.id)
    select count(*)::int as n from tree where document_access_level(${ctx.user.id}, id) < 2`;
  if (n > 0) throw new UserError("La carpeta contiene documentos que no puedes eliminar");
  await sql`delete from share_links where entity_type = 'document' and entity_id = ${id}`;
  await sql`delete from documents where id = ${id}`;
  await logActivity({ workspaceId: ctx.ws.id, actorId: ctx.user.id, entityType: "document", entityId: id, action: "document.deleted", summary: `eliminó «${d.title}»` });
  revalidatePath(`/w/${ctx.ws.slug}/docs`, "layout");
  if (fd.get("redirect")) redirect(`/w/${ctx.ws.slug}/docs`);
});
