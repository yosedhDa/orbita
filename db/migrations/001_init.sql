-- Orbita: esquema inicial
create extension if not exists pgcrypto;

create type workspace_role as enum ('admin', 'leader', 'member', 'guest');
create type project_role as enum ('viewer', 'editor', 'admin');
create type project_status as enum ('active', 'on_hold', 'completed', 'archived');
create type priority_level as enum ('high', 'medium', 'low');
create type task_status as enum ('pending', 'in_progress', 'in_review', 'done');

-- ── Usuarios y sesiones ────────────────────────────────────────────────
create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null,
  password_hash text not null,
  avatar_color text not null default '#3b66f0',
  created_at timestamptz not null default now()
);
create unique index users_email_lower on users (lower(email));

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  user_agent text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index sessions_user on sessions(user_id);

create table password_resets (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table login_attempts (
  id bigserial primary key,
  key text not null,
  created_at timestamptz not null default now()
);
create index login_attempts_key on login_attempts(key, created_at);

-- ── Espacios de trabajo ───────────────────────────────────────────────
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role workspace_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user on workspace_members(user_id);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  email text not null,
  role workspace_role not null,
  project_id uuid,
  project_role project_role,
  token_hash text not null unique,
  invited_by uuid references users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index invitations_ws on invitations(workspace_id);

-- ── Equipos ───────────────────────────────────────────────────────────
create table teams (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  description text not null default '',
  color text not null default '#3b66f0',
  created_at timestamptz not null default now()
);
create index teams_ws on teams(workspace_id);

create table team_members (
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  is_leader boolean not null default false,
  primary key (team_id, user_id)
);

-- ── Proyectos ─────────────────────────────────────────────────────────
create table projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  team_id uuid references teams(id) on delete set null,
  name text not null,
  description text not null default '',
  objectives text not null default '',
  category text not null default '',
  color text not null default '#3b66f0',
  owner_id uuid references users(id) on delete set null,
  status project_status not null default 'active',
  priority priority_level not null default 'medium',
  visibility text not null default 'workspace' check (visibility in ('workspace', 'private')),
  start_date date,
  end_date date,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_ws on projects(workspace_id);
alter table invitations add constraint invitations_project_fk foreign key (project_id) references projects(id) on delete cascade;

create table project_members (
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role project_role not null default 'editor',
  added_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user on project_members(user_id);

-- ── Tareas ────────────────────────────────────────────────────────────
create table tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  parent_id uuid references tasks(id) on delete cascade,
  title text not null,
  description text not null default '',
  assignee_id uuid references users(id) on delete set null,
  status task_status not null default 'pending',
  priority priority_level not null default 'medium',
  start_date date,
  due_date date,
  position double precision not null default 0,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index tasks_project on tasks(project_id);
create index tasks_ws on tasks(workspace_id);
create index tasks_assignee on tasks(assignee_id);
create index tasks_parent on tasks(parent_id);

create table task_collaborators (
  task_id uuid not null references tasks(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  primary key (task_id, user_id)
);

create table checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  text text not null,
  done boolean not null default false,
  position double precision not null default 0,
  created_at timestamptz not null default now()
);
create index checklist_task on checklist_items(task_id);

-- ── Documentos ────────────────────────────────────────────────────────
create table documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  parent_id uuid references documents(id) on delete cascade,
  is_folder boolean not null default false,
  title text not null default 'Sin título',
  icon text not null default '📄',
  content text not null default '',
  category text not null default '',
  visibility text not null default 'workspace' check (visibility in ('workspace', 'private')),
  project_id uuid references projects(id) on delete set null,
  task_id uuid references tasks(id) on delete set null,
  version integer not null default 1,
  created_by uuid references users(id) on delete set null,
  updated_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index documents_ws on documents(workspace_id);
create index documents_project on documents(project_id);

create table document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  version integer not null,
  title text not null,
  content text not null,
  author_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index document_versions_doc on document_versions(document_id, version desc);

-- ── Colaboración ──────────────────────────────────────────────────────
create table comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  entity_type text not null check (entity_type in ('project', 'task', 'document')),
  entity_id uuid not null,
  author_id uuid references users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index comments_entity on comments(entity_type, entity_id, created_at);

create table attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  entity_type text not null check (entity_type in ('project', 'task', 'document')),
  entity_id uuid not null,
  filename text not null,
  mime_type text not null,
  size_bytes integer not null,
  storage_driver text not null default 'db',
  data bytea,
  uploaded_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index attachments_entity on attachments(entity_type, entity_id);

create table events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  title text not null,
  kind text not null default 'meeting' check (kind in ('meeting', 'milestone')),
  description text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index events_ws on events(workspace_id, starts_at);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  workspace_id uuid references workspaces(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  link text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user on notifications(user_id, created_at desc);

-- Registro de actividad y auditoría (también historial de tareas)
create table activity_log (
  id bigserial primary key,
  workspace_id uuid references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  actor_id uuid references users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  summary text not null default '',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_ws on activity_log(workspace_id, created_at desc);
create index activity_entity on activity_log(entity_type, entity_id, created_at desc);

-- Enlaces compartidos (públicos de sólo lectura)
create table share_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  entity_type text not null check (entity_type in ('project', 'document')),
  entity_id uuid not null,
  token text not null unique,
  created_by uuid references users(id) on delete set null,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index share_links_entity on share_links(entity_type, entity_id);

-- ── Control de acceso: fuente única de verdad ─────────────────────────
-- Devuelve 0 = sin acceso, 1 = lectura, 2 = edición, 3 = administración
create or replace function project_access_level(p_user uuid, p_project uuid)
returns int language sql stable as $$
  select coalesce((
    select greatest(
      case when wm.role = 'admin' then 3 else 0 end,
      case when p.owner_id = p_user and wm.role <> 'guest' then 3 else 0 end,
      coalesce((select case pm.role when 'admin' then 3 when 'editor' then 2 else 1 end
                from project_members pm where pm.project_id = p.id and pm.user_id = p_user), 0),
      case when wm.role in ('leader', 'member') and p.team_id is not null then
        coalesce((select case when tm.is_leader then 3 else 2 end
                  from team_members tm where tm.team_id = p.team_id and tm.user_id = p_user), 0)
      else 0 end,
      case when wm.role in ('leader', 'member') and p.visibility = 'workspace' then 1 else 0 end
    )
    from projects p
    join workspace_members wm on wm.workspace_id = p.workspace_id and wm.user_id = p_user
    where p.id = p_project
  ), 0)
$$;

-- 0 = sin acceso, 1 = lectura, 2 = edición
create or replace function document_access_level(p_user uuid, p_doc uuid)
returns int language sql stable as $$
  select coalesce((
    select case
      when wm.role = 'admin' then 2
      when d.visibility = 'private' then case when d.created_by = p_user then 2 else 0 end
      when d.project_id is not null then least(2, project_access_level(p_user, d.project_id))
      when wm.role = 'guest' then 0
      else 2
    end
    from documents d
    join workspace_members wm on wm.workspace_id = d.workspace_id and wm.user_id = p_user
    where d.id = p_doc
  ), 0)
$$;

