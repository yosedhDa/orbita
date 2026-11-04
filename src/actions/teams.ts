"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { safeAction, UserError } from "@/lib/action";
import { AccessError, canManageTeam, wsContextById } from "@/lib/access";
import { logActivity, notify } from "@/lib/events";

const uuid = z.string().uuid();

export const createTeam = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  if (ctx.role !== "admin" && ctx.role !== "leader") throw new AccessError("Sólo administradores y líderes pueden crear equipos");
  const d = z.object({
    name: z.string().trim().min(2, "Nombre demasiado corto").max(60),
    description: z.string().max(500).default(""),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#3b66f0"),
  }).parse({ name: fd.get("name"), description: fd.get("description") ?? "", color: fd.get("color") ?? undefined });
  const [t] = await sql<{ id: string }[]>`insert into teams (workspace_id, name, description, color) values (${ctx.ws.id}, ${d.name}, ${d.description}, ${d.color}) returning id`;
  // Un líder que crea un equipo queda como líder del mismo
  if (ctx.role === "leader") await sql`insert into team_members (team_id, user_id, is_leader) values (${t.id}, ${ctx.user.id}, true)`;
  await logActivity({ workspaceId: ctx.ws.id, actorId: ctx.user.id, entityType: "team", entityId: t.id, action: "team.created", summary: `creó el equipo «${d.name}»` });
  redirect(`/w/${ctx.ws.slug}/teams/${t.id}`);
});

export const updateTeam = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  const id = uuid.parse(fd.get("teamId"));
  if (!(await canManageTeam(ctx, id))) throw new AccessError();
  const d = z.object({ name: z.string().trim().min(2).max(60), description: z.string().max(500), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) })
    .parse({ name: fd.get("name"), description: fd.get("description") ?? "", color: fd.get("color") ?? "#3b66f0" });
  await sql`update teams set name = ${d.name}, description = ${d.description}, color = ${d.color} where id = ${id}`;
  revalidatePath(`/w/${ctx.ws.slug}/teams`, "layout");
  return { ok: true, message: "Equipo guardado" };
});

export const deleteTeam = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  if (ctx.role !== "admin") throw new AccessError();
  const id = uuid.parse(fd.get("teamId"));
  const [t] = await sql<{ name: string }[]>`delete from teams where id = ${id} and workspace_id = ${ctx.ws.id} returning name`;
  if (t) await logActivity({ workspaceId: ctx.ws.id, actorId: ctx.user.id, entityType: "team", entityId: id, action: "team.deleted", summary: `eliminó el equipo «${t.name}»` });
  redirect(`/w/${ctx.ws.slug}/teams`);
});

export const setTeamMember = safeAction(async (fd) => {
  const ctx = await wsContextById(uuid.parse(fd.get("workspaceId")));
  const teamId = uuid.parse(fd.get("teamId"));
  if (!(await canManageTeam(ctx, teamId))) throw new AccessError("Sólo administradores o líderes del equipo pueden gestionar integrantes");
  const userId = uuid.parse(fd.get("userId"));
  const op = z.enum(["add", "remove", "lead", "unlead"]).parse(fd.get("op"));
  if ((op === "lead" || op === "unlead") && ctx.role !== "admin") throw new AccessError("Sólo un administrador puede asignar líderes");
  const [m] = await sql<{ name: string; role: string }[]>`select u.name, wm.role from workspace_members wm join users u on u.id = wm.user_id where wm.workspace_id = ${ctx.ws.id} and wm.user_id = ${userId}`;
  if (!m) throw new UserError("La persona no pertenece al espacio");
  if (m.role === "guest" && op !== "remove") throw new UserError("Los invitados no pueden formar parte de equipos");
  const [team] = await sql<{ name: string }[]>`select name from teams where id = ${teamId}`;
  if (op === "add") {
    await sql`insert into team_members (team_id, user_id) values (${teamId}, ${userId}) on conflict do nothing`;
    await notify([userId], { workspaceId: ctx.ws.id, actorId: ctx.user.id, kind: "team", title: `${ctx.user.name} te agregó al equipo «${team.name}»`, link: `/w/${ctx.ws.slug}/teams/${teamId}` });
  } else if (op === "remove") {
    await sql`delete from team_members where team_id = ${teamId} and user_id = ${userId}`;
  } else {
    await sql`insert into team_members (team_id, user_id, is_leader) values (${teamId}, ${userId}, ${op === "lead"})
      on conflict (team_id, user_id) do update set is_leader = excluded.is_leader`;
    if (op === "lead") await sql`update workspace_members set role = 'leader' where workspace_id = ${ctx.ws.id} and user_id = ${userId} and role = 'member'`;
  }
  const verb = { add: "agregó a", remove: "quitó a", lead: "nombró líder a", unlead: "quitó el liderazgo a" }[op];
  await logActivity({ workspaceId: ctx.ws.id, actorId: ctx.user.id, entityType: "team", entityId: teamId, action: `team.member_${op}`, summary: `${verb} ${m.name} en el equipo «${team.name}»` });
  revalidatePath(`/w/${ctx.ws.slug}`, "layout");
});
