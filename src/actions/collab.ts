"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { randomToken } from "@/lib/crypto";
import { safeAction } from "@/lib/action";
import { AccessError, LEVEL, entityLevel, requireProject, wsContextById } from "@/lib/access";
import { extractMentions, logActivity, notify } from "@/lib/events";
import { appUrl } from "@/lib/mail";

const uuid = z.string().uuid();
const entityType = z.enum(["project", "task", "document"]);

function entityLink(slug: string, type: string, id: string, projectId: string | null) {
  if (type === "task") return `/w/${slug}/projects/${projectId}?task=${id}`;
  if (type === "project") return `/w/${slug}/projects/${id}`;
  return `/w/${slug}/docs/${id}`;
}

export const addComment = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  const type = entityType.parse(fd.get("entityType"));
  const id = uuid.parse(fd.get("entityId"));
  const body = z.string().trim().min(1, "Escribe un comentario").max(5000).parse(fd.get("body"));
  const e = await entityLevel(ctx, type, id);
  const min = ctx.role === "guest" ? LEVEL.edit : LEVEL.view;
  if (e.level < min) throw new AccessError("No tienes permiso para comentar aquí");
  await sql`insert into comments (workspace_id, entity_type, entity_id, author_id, body) values (${ctx.ws.id}, ${type}, ${id}, ${ctx.user.id}, ${body})`;
  await logActivity({ workspaceId: ctx.ws.id, projectId: e.projectId, actorId: ctx.user.id, entityType: type, entityId: id, action: "comment.created", summary: `comentó en «${e.title}»` });
  const link = entityLink(ctx.ws.slug, type, id, e.projectId);

  // Menciones: sólo se notifica a quien puede ver el elemento
  const mentioned = extractMentions(body);
  const allowed: string[] = [];
  for (const uid of [...new Set(mentioned)]) {
    const lvl = type === "project"
      ? (await sql<{ l: number }[]>`select project_access_level(${uid}, ${id}) l`)[0].l
      : type === "task"
        ? (await sql<{ l: number }[]>`select project_access_level(${uid}, ${e.projectId}) l`)[0].l
        : (await sql<{ l: number }[]>`select document_access_level(${uid}, ${id}) l`)[0].l;
    if (lvl > 0) allowed.push(uid);
  }
  const plain = body.replace(/@\[([^\]]+)\]\([0-9a-f-]{36}\)/g, "@$1").slice(0, 200);
  await notify(allowed, { workspaceId: ctx.ws.id, actorId: ctx.user.id, kind: "mention", title: `${ctx.user.name} te mencionó en «${e.title}»`, body: plain, link });

  // Participantes del elemento
  let watchers: (string | null)[] = [];
  if (type === "task") {
    const [t] = await sql<{ assignee_id: string | null; created_by: string | null }[]>`select assignee_id, created_by from tasks where id = ${id}`;
    const collab = await sql<{ user_id: string }[]>`select user_id from task_collaborators where task_id = ${id}`;
    watchers = [t.assignee_id, t.created_by, ...collab.map((c) => c.user_id)];
  } else if (type === "project") {
    const [p] = await sql<{ owner_id: string | null }[]>`select owner_id from projects where id = ${id}`;
    watchers = [p.owner_id];
  } else {
    const [d] = await sql<{ created_by: string | null }[]>`select created_by from documents where id = ${id}`;
    watchers = [d.created_by];
  }
  await notify(watchers.filter((w) => w && !allowed.includes(w)), { workspaceId: ctx.ws.id, actorId: ctx.user.id, kind: "comment", title: `${ctx.user.name} comentó en «${e.title}»`, body: plain, link });
  revalidatePath(`/w/${ctx.ws.slug}`, "layout");
});

export const deleteComment = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  const id = uuid.parse(fd.get("commentId"));
  const [c] = await sql<{ author_id: string }[]>`select author_id from comments where id = ${id} and workspace_id = ${ctx.ws.id}`;
  if (!c || (c.author_id !== ctx.user.id && ctx.role !== "admin")) throw new AccessError();
  await sql`delete from comments where id = ${id}`;
  revalidatePath(`/w/${ctx.ws.slug}`, "layout");
});

export const deleteAttachment = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  const id = uuid.parse(fd.get("attachmentId"));
  const [a] = await sql<{ entity_type: string; entity_id: string; uploaded_by: string; filename: string }[]>`
    select entity_type, entity_id, uploaded_by, filename from attachments where id = ${id} and workspace_id = ${ctx.ws.id}`;
  if (!a) throw new AccessError();
  const e = await entityLevel(ctx, a.entity_type, a.entity_id);
  if (e.level < LEVEL.edit && a.uploaded_by !== ctx.user.id) throw new AccessError();
  await sql`delete from attachments where id = ${id}`;
  await logActivity({ workspaceId: ctx.ws.id, projectId: e.projectId, actorId: ctx.user.id, entityType: a.entity_type, entityId: a.entity_id, action: "attachment.deleted", summary: `eliminó el archivo «${a.filename}»` });
  revalidatePath(`/w/${ctx.ws.slug}`, "layout");
});

export const createEvent = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  const d = z.object({
    title: z.string().trim().min(2, "Escribe un título").max(200),
    kind: z.enum(["meeting", "milestone"]),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida"),
    time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    duration: z.coerce.number().int().min(0).max(24 * 60).default(60),
    projectId: z.preprocess((v) => (v ? v : null), uuid.nullable()),
    description: z.string().max(2000).default(""),
    tz: z.coerce.number().int().min(-900).max(900).default(0),
  }).parse({
    title: fd.get("title"), kind: fd.get("kind"), date: fd.get("date"), time: fd.get("time") || undefined, duration: fd.get("duration") || undefined,
    projectId: fd.get("projectId"), description: fd.get("description") ?? "", tz: fd.get("tz") || 0,
  });
  if (d.projectId) await requireProject(ctx, d.projectId, LEVEL.edit);
  else if (ctx.role === "guest") throw new AccessError();
  // La hora llega en hora local del navegador; tz = getTimezoneOffset() en minutos
  const [y, m, day] = d.date.split("-").map(Number);
  const [hh, mm] = (d.time ?? "09:00").split(":").map(Number);
  const starts = new Date(Date.UTC(y, m - 1, day, hh, mm) + d.tz * 60_000);
  const ends = d.kind === "meeting" ? new Date(starts.getTime() + d.duration * 60_000) : null;
  const [ev] = await sql<{ id: string }[]>`insert into events (workspace_id, project_id, title, kind, description, starts_at, ends_at, created_by)
    values (${ctx.ws.id}, ${d.projectId}, ${d.title}, ${d.kind}, ${d.description}, ${starts}, ${ends}, ${ctx.user.id}) returning id`;
  await logActivity({ workspaceId: ctx.ws.id, projectId: d.projectId, actorId: ctx.user.id, entityType: "event", entityId: ev.id, action: "event.created",
    summary: `programó ${d.kind === "meeting" ? "la reunión" : "el hito"} «${d.title}» para el ${d.date}` });
  revalidatePath(`/w/${ctx.ws.slug}`, "layout");
  return { ok: true, message: "Evento creado" };
});

export const deleteEvent = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  const id = uuid.parse(fd.get("eventId"));
  const [ev] = await sql<{ created_by: string; project_id: string | null }[]>`select created_by, project_id from events where id = ${id} and workspace_id = ${ctx.ws.id}`;
  if (!ev) throw new AccessError();
  const ok = ctx.role === "admin" || ev.created_by === ctx.user.id ||
    (ev.project_id && (await sql<{ l: number }[]>`select project_access_level(${ctx.user.id}, ${ev.project_id}) l`)[0].l >= LEVEL.admin);
  if (!ok) throw new AccessError();
  await sql`delete from events where id = ${id}`;
  revalidatePath(`/w/${ctx.ws.slug}`, "layout");
});

export const createShareLink = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  const type = z.enum(["project", "document"]).parse(fd.get("entityType"));
  const id = uuid.parse(fd.get("entityId"));
  const e = await entityLevel(ctx, type, id);
  const need = type === "project" ? LEVEL.admin : LEVEL.edit;
  if (e.level < need || ctx.role === "guest") throw new AccessError("No tienes permiso para crear enlaces públicos");
  const days = z.coerce.number().int().min(0).max(365).default(0).parse(fd.get("days") || 0);
  const token = randomToken(24);
  await sql`insert into share_links (workspace_id, entity_type, entity_id, token, created_by, expires_at)
    values (${ctx.ws.id}, ${type}, ${id}, ${token}, ${ctx.user.id}, ${days ? new Date(Date.now() + days * 864e5) : null})`;
  await logActivity({ workspaceId: ctx.ws.id, projectId: e.projectId, actorId: ctx.user.id, entityType: type, entityId: id, action: "share.link_created", summary: `creó un enlace público de sólo lectura para «${e.title}»` });
  revalidatePath(`/w/${ctx.ws.slug}`, "layout");
  return { ok: true, data: { link: `${appUrl()}/share/${token}` } };
});

export const revokeShareLink = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  const id = uuid.parse(fd.get("linkId"));
  const [l] = await sql<{ entity_type: string; entity_id: string; created_by: string }[]>`select entity_type, entity_id, created_by from share_links where id = ${id} and workspace_id = ${ctx.ws.id}`;
  if (!l) throw new AccessError();
  const e = await entityLevel(ctx, l.entity_type, l.entity_id);
  if (ctx.role !== "admin" && l.created_by !== ctx.user.id && e.level < LEVEL.admin) throw new AccessError();
  await sql`update share_links set revoked_at = now() where id = ${id}`;
  await logActivity({ workspaceId: ctx.ws.id, projectId: e.projectId, actorId: ctx.user.id, entityType: l.entity_type, entityId: l.entity_id, action: "share.link_revoked", summary: `revocó un enlace público de «${e.title}»` });
  revalidatePath(`/w/${ctx.ws.slug}`, "layout");
});

export const markNotificationsRead = safeAction(async (fd) => {
  const user = await requireUser();
  const id = fd.get("id");
  if (id) await sql`update notifications set read_at = now() where id = ${uuid.parse(id)} and user_id = ${user.id}`;
  else await sql`update notifications set read_at = now() where user_id = ${user.id} and read_at is null`;
  revalidatePath("/", "layout");
});
