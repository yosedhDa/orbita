import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { sql } from "./db";
import { requireUser, type SessionUser } from "./auth";
import type { WorkspaceRole } from "./labels";

export class AccessError extends Error {
  constructor(message = "No tienes permiso para realizar esta acción") {
    super(message);
  }
}

export type Workspace = { id: string; name: string; slug: string };
export type WsContext = { user: SessionUser; ws: Workspace; role: WorkspaceRole };

/** Niveles de acceso a proyectos (ver función SQL project_access_level) */
export const LEVEL = { none: 0, view: 1, edit: 2, admin: 3 } as const;

async function loadContext(user: SessionUser, where: { slug?: string; id?: string }): Promise<WsContext | null> {
  const rows = await sql<(Workspace & { role: WorkspaceRole })[]>`
    select w.id, w.name, w.slug, wm.role
    from workspaces w join workspace_members wm on wm.workspace_id = w.id and wm.user_id = ${user.id}
    where ${where.slug ? sql`w.slug = ${where.slug}` : sql`w.id = ${where.id!}`}`;
  if (!rows[0]) return null;
  const { role, ...ws } = rows[0];
  return { user, ws, role };
}

/** Contexto de espacio de trabajo para páginas: 404 si el usuario no es miembro. */
export const getWsContext = cache(async (slug: string): Promise<WsContext> => {
  const user = await requireUser();
  const ctx = await loadContext(user, { slug });
  if (!ctx) notFound();
  return ctx;
});

/** Contexto para acciones de servidor: lanza AccessError si no es miembro. */
export async function wsContextById(workspaceId: string): Promise<WsContext> {
  const user = await requireUser();
  const ctx = await loadContext(user, { id: workspaceId });
  if (!ctx) throw new AccessError();
  return ctx;
}

export const isAdmin = (r: WorkspaceRole) => r === "admin";
export const canCreateProjects = (r: WorkspaceRole) => r !== "guest";
export const canSeeDirectory = (r: WorkspaceRole) => r !== "guest";

export async function projectLevel(userId: string, projectId: string): Promise<number> {
  const [r] = await sql<{ l: number }[]>`select project_access_level(${userId}, ${projectId}) as l`;
  return r?.l ?? 0;
}

export async function requireProject(ctx: WsContext, projectId: string, min: number) {
  const rows = await sql<{ id: string; name: string; workspace_id: string; level: number }[]>`
    select id, name, workspace_id, project_access_level(${ctx.user.id}, id) as level
    from projects where id = ${projectId} and workspace_id = ${ctx.ws.id}`;
  const p = rows[0];
  if (!p || p.level < min) throw new AccessError();
  return p;
}

/** Nivel de acceso a una tarea: el responsable y colaboradores pueden editarla aunque tengan sólo lectura del proyecto. */
export async function taskLevel(userId: string, taskId: string) {
  const rows = await sql<{ id: string; project_id: string; workspace_id: string; title: string; assignee_id: string | null; level: number; involved: boolean }[]>`
    select t.id, t.project_id, t.workspace_id, t.title, t.assignee_id,
      project_access_level(${userId}, t.project_id) as level,
      (t.assignee_id = ${userId} or exists (select 1 from task_collaborators c where c.task_id = t.id and c.user_id = ${userId})) as involved
    from tasks t where t.id = ${taskId}`;
  const t = rows[0];
  if (!t) return null;
  const level = t.level >= 1 && t.involved ? Math.max(t.level, LEVEL.edit) : t.level;
  return { ...t, level };
}

export async function requireTask(ctx: WsContext, taskId: string, min: number) {
  const t = await taskLevel(ctx.user.id, taskId);
  if (!t || t.workspace_id !== ctx.ws.id || t.level < min) throw new AccessError();
  return t;
}

export async function documentLevel(userId: string, docId: string): Promise<number> {
  const [r] = await sql<{ l: number }[]>`select document_access_level(${userId}, ${docId}) as l`;
  return r?.l ?? 0;
}

export async function requireDocument(ctx: WsContext, docId: string, min: number) {
  const rows = await sql<{ id: string; title: string; project_id: string | null; level: number }[]>`
    select id, title, project_id, document_access_level(${ctx.user.id}, id) as level
    from documents where id = ${docId} and workspace_id = ${ctx.ws.id}`;
  const d = rows[0];
  if (!d || d.level < min) throw new AccessError();
  return d;
}

/** ¿Puede el usuario gestionar el equipo? (admin o líder de ese equipo) */
export async function canManageTeam(ctx: WsContext, teamId: string) {
  if (ctx.role === "admin") return true;
  if (ctx.role !== "leader") return false;
  const r = await sql`select 1 from team_members tm join teams t on t.id = tm.team_id
    where tm.team_id = ${teamId} and t.workspace_id = ${ctx.ws.id} and tm.user_id = ${ctx.user.id} and tm.is_leader`;
  return r.length > 0;
}

/** Acceso genérico a una entidad comentable / con adjuntos. */
export async function entityLevel(ctx: WsContext, type: string, id: string): Promise<{ level: number; projectId: string | null; title: string }> {
  if (type === "project") {
    const p = await sql<{ name: string }[]>`select name from projects where id = ${id} and workspace_id = ${ctx.ws.id}`;
    if (!p[0]) return { level: 0, projectId: null, title: "" };
    return { level: await projectLevel(ctx.user.id, id), projectId: id, title: p[0].name };
  }
  if (type === "task") {
    const t = await taskLevel(ctx.user.id, id);
    if (!t || t.workspace_id !== ctx.ws.id) return { level: 0, projectId: null, title: "" };
    return { level: t.level, projectId: t.project_id, title: t.title };
  }
  if (type === "document") {
    const d = await sql<{ title: string; project_id: string | null }[]>`select title, project_id from documents where id = ${id} and workspace_id = ${ctx.ws.id}`;
    if (!d[0]) return { level: 0, projectId: null, title: "" };
    return { level: await documentLevel(ctx.user.id, id), projectId: d[0].project_id, title: d[0].title };
  }
  return { level: 0, projectId: null, title: "" };
}
