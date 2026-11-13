-- Etapa 3: objetivos/KPI, automatizaciones y suscripción de calendario

create table goals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  team_id uuid references teams(id) on delete set null,
  owner_id uuid references users(id) on delete set null,
  title text not null,
  description text not null default '',
  -- manual: valor actualizado a mano; project_progress: % medio de los proyectos vinculados;
  -- tasks_completed: tareas completadas en los proyectos vinculados dentro del periodo
  metric_type text not null default 'manual' check (metric_type in ('manual', 'project_progress', 'tasks_completed')),
  target_value numeric not null default 100 check (target_value > 0),
  current_value numeric not null default 0,
  unit text not null default '%',
  start_date date,
  due_date date,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index goals_ws on goals(workspace_id);

create table goal_projects (
  goal_id uuid not null references goals(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  primary key (goal_id, project_id)
);

create table goal_updates (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references goals(id) on delete cascade,
  value numeric,
  note text not null default '',
  author_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index goal_updates_goal on goal_updates(goal_id, created_at desc);

create table automations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  enabled boolean not null default true,
  trigger text not null check (trigger in ('task_created', 'status_changed')),
  trigger_status task_status,
  action text not null check (action in ('set_assignee', 'set_priority', 'set_status', 'notify_user', 'add_checklist', 'add_comment')),
  action_value text not null default '',
  run_count integer not null default 0,
  last_run_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index automations_project on automations(project_id) where enabled;

-- Token secreto para la URL de suscripción iCalendar de cada usuario
alter table users add column calendar_token text unique;
