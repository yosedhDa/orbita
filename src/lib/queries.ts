import "server-only";
import { sql } from "./db";
import type { WsContext } from "./access";
import type { Priority, ProjectStatus, TaskStatus, WorkspaceRole } from "./labels";

export type Member = { id: string; name: string; email: string; avatar_color: string; role: WorkspaceRole };
export type ProjectSummary = {
  id: string; name: string; color: string; status: ProjectStatus; priority: Priority; category: string; description: string;
  start_date: string | null; end_date: string | null; team_id: string | null; team_name: string | null; visibility: string;
  owner_id: string | null; owner_name: string | null; owner_color: string | null; level: number;
  total: number; done: number; overdue: number;
};
export type TaskItem = {
  id: string; title: string; status: TaskStatus; priority: Priority; due_date: string | null; start_date: string | null;
  position: number; project_id: string; project_name: string; project_color: string; parent_id: string | null;
  assignee_id: string | null; assignee_name: string | null; assignee_color: string | null;
  subtasks: number; subtasks_done: number; checklist: number; checklist_done: number; comments: number; attachments: number;
  created_at: string;
};

export async function listMembers(wsId: string): Promise<Member[]> {
  return sql<Member[]>`select u.id, u.name, u.email, u.avatar_color, wm.role
    from workspace_members wm join users u on u.id = wm.user_id where wm.workspace_id = ${wsId} order by u.name`;
}

/** Personas que pueden verse en selectores: los invitados sólo ven a quienes comparten proyectos con ellos. */
export async function visibleMembers(ctx: WsContext): Promise<Member[]> {
  if (ctx.role !== "guest") return listMembers(ctx.ws.id);
  return sql<Member[]>`select distinct u.id, u.name, u.email, u.avatar_color, wm.role
    from workspace_members wm join users u on u.id = wm.user_id
    where wm.workspace_id = ${ctx.ws.id} and (u.id = ${ctx.user.id} or exists (
      select 1 from projects p where p.workspace_id = ${ctx.ws.id}
        and project_access_level(${ctx.user.id}, p.id) >= 1 and project_access_level(u.id, p.id) >= 1))
    order by u.name`;
}

export async function listProjects(ctx: WsContext, opts: { teamId?: string; projectIds?: string[] } = {}): Promise<ProjectSummary[]> {
  return sql<ProjectSummary[]>`
    select p.id, p.name, p.color, p.status, p.priority, p.category, p.description, p.visibility,
      to_char(p.start_date, 'YYYY-MM-DD') as start_date, to_char(p.end_date, 'YYYY-MM-DD') as end_date,
      p.team_id, t.name as team_name, p.owner_id, u.name as owner_name, u.avatar_color as owner_color,
      project_access_level(${ctx.user.id}, p.id) as level,
      (select count(*) from tasks x where x.project_id = p.id and x.parent_id is null)::int as total,
      (select count(*) from tasks x where x.project_id = p.id and x.parent_id is null and x.status = 'done')::int as done,
      (select count(*) from tasks x where x.project_id = p.id and x.status <> 'done' and x.due_date < current_date)::int as overdue
    from projects p
    left join teams t on t.id = p.team_id
    left join users u on u.id = p.owner_id
    where p.workspace_id = ${ctx.ws.id} and project_access_level(${ctx.user.id}, p.id) >= 1
      ${opts.teamId ? sql`and p.team_id = ${opts.teamId}` : sql``}
      ${opts.projectIds ? sql`and p.id in ${sql(opts.projectIds.length ? opts.projectIds : ["00000000-0000-0000-0000-000000000000"])}` : sql``}
    order by case p.status when 'active' then 0 when 'on_hold' then 1 when 'completed' then 2 else 3 end, p.created_at desc`;
}

export async function listTasks(ctx: WsContext, opts: { projectId?: string; assigneeId?: string; topLevelOnly?: boolean; userIds?: string[] } = {}): Promise<TaskItem[]> {
  return sql<TaskItem[]>`
    select t.id, t.title, t.status, t.priority, to_char(t.due_date, 'YYYY-MM-DD') as due_date, to_char(t.start_date, 'YYYY-MM-DD') as start_date,
      t.position, t.project_id, p.name as project_name, p.color as project_color, t.parent_id, t.created_at,
      t.assignee_id, u.name as assignee_name, u.avatar_color as assignee_color,
      (select count(*) from tasks s where s.parent_id = t.id)::int as subtasks,
      (select count(*) from tasks s where s.parent_id = t.id and s.status = 'done')::int as subtasks_done,
      (select count(*) from checklist_items c where c.task_id = t.id)::int as checklist,
      (select count(*) from checklist_items c where c.task_id = t.id and c.done)::int as checklist_done,
      (select count(*) from comments c where c.entity_type = 'task' and c.entity_id = t.id)::int as comments,
      (select count(*) from attachments a where a.entity_type = 'task' and a.entity_id = t.id)::int as attachments
    from tasks t
    join projects p on p.id = t.project_id
    left join users u on u.id = t.assignee_id
    where t.workspace_id = ${ctx.ws.id} and project_access_level(${ctx.user.id}, t.project_id) >= 1
      ${opts.projectId ? sql`and t.project_id = ${opts.projectId}` : sql``}
      ${opts.assigneeId ? sql`and t.assignee_id = ${opts.assigneeId}` : sql``}
      ${opts.userIds ? sql`and t.assignee_id in ${sql(opts.userIds.length ? opts.userIds : ["00000000-0000-0000-0000-000000000000"])}` : sql``}
      ${opts.topLevelOnly ? sql`and t.parent_id is null` : sql``}
    order by t.position, t.created_at`;
}

export type ActivityItem = { id: string; summary: string; action: string; entity_type: string; entity_id: string | null; project_id: string | null; created_at: Date; actor_name: string | null; actor_color: string | null };

export async function listActivity(ctx: WsContext, opts: { limit?: number; projectId?: string; entity?: { type: string; id: string }; actorIds?: string[] } = {}): Promise<ActivityItem[]> {
  const restrict = ctx.role === "guest"
    ? sql`and a.project_id is not null and project_access_level(${ctx.user.id}, a.project_id) >= 1`
    : sql`and (a.project_id is null or project_access_level(${ctx.user.id}, a.project_id) >= 1)
          and (a.entity_type <> 'document' or document_access_level(${ctx.user.id}, a.entity_id) >= 1 or a.action = 'document.deleted')`;
  return sql<ActivityItem[]>`
    select a.id::text, a.summary, a.action, a.entity_type, a.entity_id, a.project_id, a.created_at, u.name as actor_name, u.avatar_color as actor_color
    from activity_log a left join users u on u.id = a.actor_id
    where a.workspace_id = ${ctx.ws.id} ${restrict}
      and a.action not like 'auth.%'
      ${opts.projectId ? sql`and a.project_id = ${opts.projectId}` : sql``}
      ${opts.entity ? sql`and a.entity_type = ${opts.entity.type} and a.entity_id = ${opts.entity.id}` : sql``}
      ${opts.actorIds ? sql`and a.actor_id in ${sql(opts.actorIds.length ? opts.actorIds : ["00000000-0000-0000-0000-000000000000"])}` : sql``}
    order by a.id desc limit ${opts.limit ?? 30}`;
}

export type CommentItem = { id: string; body: string; created_at: Date; author_id: string | null; author_name: string | null; author_color: string | null };
export async function listComments(type: string, id: string): Promise<CommentItem[]> {
  return sql<CommentItem[]>`select c.id, c.body, c.created_at, c.author_id, u.name as author_name, u.avatar_color as author_color
    from comments c left join users u on u.id = c.author_id where c.entity_type = ${type} and c.entity_id = ${id} order by c.created_at`;
}

export type AttachmentItem = { id: string; filename: string; mime_type: string; size_bytes: number; created_at: Date; uploaded_by: string | null; uploader: string | null };
export async function listAttachments(type: string, id: string): Promise<AttachmentItem[]> {
  return sql<AttachmentItem[]>`select a.id, a.filename, a.mime_type, a.size_bytes, a.created_at, a.uploaded_by, u.name as uploader
    from attachments a left join users u on u.id = a.uploaded_by where a.entity_type = ${type} and a.entity_id = ${id} order by a.created_at desc`;
}

export type ShareLinkItem = { id: string; token: string; created_at: Date; expires_at: Date | null; creator: string | null };
export async function listShareLinks(type: string, id: string): Promise<ShareLinkItem[]> {
  return sql<ShareLinkItem[]>`select s.id, s.token, s.created_at, s.expires_at, u.name as creator from share_links s left join users u on u.id = s.created_by
    where s.entity_type = ${type} and s.entity_id = ${id} and s.revoked_at is null and (s.expires_at is null or s.expires_at > now()) order by s.created_at desc`;
}

export type EventItem = { id: string; title: string; kind: "meeting" | "milestone"; description: string; starts_at: Date; ends_at: Date | null; project_id: string | null; project_name: string | null; project_color: string | null; created_by: string | null };
export async function listEvents(ctx: WsContext, from: string, to: string, projectId?: string): Promise<EventItem[]> {
  return sql<EventItem[]>`select e.id, e.title, e.kind, e.description, e.starts_at, e.ends_at, e.project_id, p.name as project_name, p.color as project_color, e.created_by
    from events e left join projects p on p.id = e.project_id
    where e.workspace_id = ${ctx.ws.id} and e.starts_at >= ${from}::date - 1 and e.starts_at < ${to}::date + 2
      and ${ctx.role === "guest" ? sql`e.project_id is not null and` : sql``} (e.project_id is null or project_access_level(${ctx.user.id}, e.project_id) >= 1)
      ${projectId ? sql`and e.project_id = ${projectId}` : sql``}
    order by e.starts_at`;
}
