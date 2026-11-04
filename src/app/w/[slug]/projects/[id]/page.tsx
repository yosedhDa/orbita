import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { CalendarDays, FileText, Kanban, LayoutList, Lock, Settings, Target, Users } from "lucide-react";
import { LEVEL, getWsContext, projectLevel } from "@/lib/access";
import { sql } from "@/lib/db";
import { listActivity, listEvents, listTasks, visibleMembers } from "@/lib/queries";
import { deleteProject, updateProject } from "@/actions/projects";
import { createDocument } from "@/actions/docs";
import { createEvent } from "@/actions/collab";
import { Avatar, AvatarStack, EmptyState, PriorityBadge, Progress, ProjectStatusBadge, fmtDate, percent, todayStr } from "@/components/ui";
import { ActionForm, SubmitButton, Modal } from "@/components/forms";
import { KanbanBoard } from "@/components/Kanban";
import { QuickAddTask } from "@/components/QuickAddTask";
import { TaskListView, TaskMonthCalendar, linkBase } from "@/components/TaskViews";
import { TaskDrawer } from "@/components/TaskDrawer";
import { ActivityList, Attachments, Comments } from "@/components/Collab";
import { ProjectForm } from "@/components/ProjectForm";
import { ProjectMembers, PublicLinks } from "@/components/SharePanel";
import { EventForm } from "@/components/EventForm";
import { PROJECT_ROLE_LABEL, STATUS_LABEL, STATUS_ORDER, STATUS_STYLE, type Priority, type ProjectRole, type ProjectStatus, type WorkspaceRole } from "@/lib/labels";

type SP = { view?: string; task?: string; month?: string; assignee?: string; status?: string };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return {};
  const [p] = await sql<{ name: string }[]>`select name from projects where id = ${id}`;
  return { title: p?.name ?? "Proyecto" };
}

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<SP> }) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await getWsContext(slug);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const level = await projectLevel(ctx.user.id, id);
  if (level < LEVEL.view) notFound();
  const base = `/w/${slug}`;
  const path = `${base}/projects/${id}`;
  const view = sp.view ?? "overview";

  const [[project], tasks, members, allMembers, teams] = await Promise.all([
    sql<{ id: string; name: string; description: string; objectives: string; category: string; color: string; status: ProjectStatus; priority: Priority; visibility: string;
      start_date: string | null; end_date: string | null; team_id: string | null; team_name: string | null; owner_id: string | null; owner_name: string | null; owner_color: string | null; created_at: Date }[]>`
      select p.id, p.name, p.description, p.objectives, p.category, p.color, p.status, p.priority, p.visibility,
        to_char(p.start_date, 'YYYY-MM-DD') as start_date, to_char(p.end_date, 'YYYY-MM-DD') as end_date, p.team_id, t.name as team_name,
        p.owner_id, u.name as owner_name, u.avatar_color as owner_color, p.created_at
      from projects p left join teams t on t.id = p.team_id left join users u on u.id = p.owner_id where p.id = ${id} and p.workspace_id = ${ctx.ws.id}`,
    listTasks(ctx, { projectId: id }),
    sql<{ user_id: string; name: string; email: string; avatar_color: string; role: ProjectRole; ws_role: WorkspaceRole }[]>`
      select pm.user_id, u.name, u.email, u.avatar_color, pm.role, wm.role as ws_role from project_members pm join users u on u.id = pm.user_id
      join workspace_members wm on wm.user_id = pm.user_id and wm.workspace_id = ${ctx.ws.id}
      where pm.project_id = ${id} order by u.name`,
    visibleMembers(ctx),
    sql<{ id: string; name: string }[]>`select id, name from teams where workspace_id = ${ctx.ws.id} order by name`,
  ]);
  if (!project) notFound();

  const canEdit = level >= LEVEL.edit;
  const canAdmin = level >= LEVEL.admin;
  const access = await sql<{ user_id: string }[]>`select user_id from workspace_members where workspace_id = ${ctx.ws.id} and project_access_level(user_id, ${id}) >= 1`;
  const accessIds = new Set(access.map((a) => a.user_id));
  const assignable = allMembers.filter((m) => accessIds.has(m.id));
  const filtered = tasks.filter((t) => (!sp.assignee || t.assignee_id === sp.assignee) && (!sp.status || t.status === sp.status));
  const top = tasks.filter((t) => !t.parent_id);
  const pct = percent(top.filter((t) => t.status === "done").length, top.length);
  const lb = linkBase(path, sp);
  const closeHref = lb.replace(/[?&]$/, "");
  const w = { workspaceId: ctx.ws.id, userId: ctx.user.id, isAdmin: ctx.role === "admin" };
  const myId = ctx.user.id;
  const canToggle = (t: { assignee_id: string | null }) => canEdit || t.assignee_id === myId;

  const tabs = [
    { k: "overview", l: "Resumen", icon: Target },
    { k: "list", l: "Lista", icon: LayoutList },
    { k: "board", l: "Tablero", icon: Kanban },
    { k: "calendar", l: "Calendario", icon: CalendarDays },
    { k: "files", l: "Archivos y documentos", icon: FileText },
    { k: "people", l: canAdmin ? "Compartir" : "Participantes", icon: Users },
    ...(canEdit ? [{ k: "settings", l: "Configuración", icon: Settings }] : []),
  ];

  return (
    <>
      <div className="mb-5">
        <div className="flex flex-wrap items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white" style={{ background: project.color }}>{project.name[0]?.toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <h1 className="h-page flex items-center gap-2">{project.name}{project.visibility === "private" && <Lock className="h-4 w-4 text-ink-400" aria-label="Privado" />}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-500">
              <ProjectStatusBadge status={project.status} /><PriorityBadge priority={project.priority} />
              {project.category && <span className="chip bg-ink-100 text-ink-600">{project.category}</span>}
              {project.team_name && <Link href={`${base}/teams/${project.team_id}`} className="chip bg-violet-50 text-violet-700 hover:underline">{project.team_name}</Link>}
              {(project.start_date || project.end_date) && <span>{fmtDate(project.start_date, true) || "—"} → {fmtDate(project.end_date, true) || "—"}</span>}
              <span className="chip bg-ink-100 text-ink-600">Tu acceso: {canAdmin ? "Administración" : canEdit ? "Edición" : "Lectura"}</span>
            </div>
          </div>
          <div className="flex w-full items-center gap-3 sm:w-auto">
            <AvatarStack people={members.map((m) => ({ name: m.name, avatar_color: m.avatar_color }))} />
            <div className="flex-1 sm:w-32 sm:flex-none"><div className="mb-1 flex justify-between text-xs"><span className="text-ink-500">Avance</span><b data-testid="project-progress">{pct}%</b></div><Progress value={pct} color={project.color} /></div>
          </div>
        </div>
        <nav className="mt-5 flex gap-5 overflow-x-auto border-b border-ink-200">
          {tabs.map((t) => (
            <Link key={t.k} href={`${path}?view=${t.k}`} className={clsx("tab", view === t.k && "tab-active")}><t.icon className="h-4 w-4" />{t.l}</Link>
          ))}
        </nav>
      </div>

      {view === "overview" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <section className="card p-5">
              <h2 className="mb-2 font-semibold">Descripción</h2>
              <p className="whitespace-pre-wrap text-sm text-ink-700">{project.description || <span className="text-ink-400">Sin descripción.</span>}</p>
              {project.objectives && (<><h2 className="mb-2 mt-5 font-semibold">Objetivos</h2>
                <ul className="list-disc space-y-1 pl-5 text-sm text-ink-700">{project.objectives.split("\n").filter(Boolean).map((o, i) => <li key={i}>{o}</li>)}</ul></>)}
            </section>
            <section className="card p-5">
              <h2 className="mb-3 font-semibold">Estado de las tareas</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {STATUS_ORDER.map((s) => (
                  <Link key={s} href={`${path}?view=list&status=${s}`} className="rounded-lg p-3 ring-1 ring-ink-100 hover:bg-ink-50">
                    <span className={clsx("mb-1 block h-1.5 w-6 rounded-full", STATUS_STYLE[s].dot)} />
                    <span className="block text-xl font-semibold">{top.filter((t) => t.status === s).length}</span>
                    <span className="text-xs text-ink-500">{STATUS_LABEL[s]}</span>
                  </Link>
                ))}
              </div>
            </section>
            <section className="card p-5">
              <h2 className="mb-4 font-semibold">Comentarios y actualizaciones</h2>
              <Comments ctx={w} type="project" id={id} canComment={ctx.role === "guest" ? canEdit : true} members={assignable} />
            </section>
          </div>
          <div className="space-y-6">
            <section className="card p-5 text-sm">
              <h2 className="mb-3 font-semibold">Detalles</h2>
              <dl className="space-y-2.5">
                <div className="flex justify-between gap-2"><dt className="text-ink-500">Responsable</dt><dd className="flex items-center gap-1.5"><Avatar name={project.owner_name} color={project.owner_color} size={20} />{project.owner_name ?? "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-500">Inicio</dt><dd>{fmtDate(project.start_date, true) || "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-500">Finalización</dt><dd>{fmtDate(project.end_date, true) || "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-500">Tareas</dt><dd>{top.length} ({tasks.length - top.length} subtareas)</dd></div>
                <div className="flex justify-between"><dt className="text-ink-500">Vencidas</dt><dd className="text-rose-600">{tasks.filter((t) => t.status !== "done" && t.due_date && t.due_date < todayStr()).length}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-500">Participantes</dt><dd>{members.length}</dd></div>
              </dl>
            </section>
            <Milestones ctx={ctx} projectId={id} canEdit={canEdit} />
            <section className="card p-5"><h2 className="mb-3 font-semibold">Actividad</h2><ActivityList items={await listActivity(ctx, { projectId: id, limit: 12 })} /></section>
          </div>
        </div>
      )}

      {(view === "list" || view === "board" || view === "calendar") && (
        <div className="space-y-4">
          <form className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="view" value={view} />
            <select name="assignee" defaultValue={sp.assignee ?? ""} className="input w-auto py-1.5" aria-label="Filtrar por responsable">
              <option value="">Todos los responsables</option>{assignable.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            {view !== "board" && (
              <select name="status" defaultValue={sp.status ?? ""} className="input w-auto py-1.5" aria-label="Filtrar por estado">
                <option value="">Todos los estados</option>{STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            )}
            <button className="btn-secondary py-1.5">Filtrar</button>
            {(sp.assignee || sp.status) && <Link href={`${path}?view=${view}`} className="text-sm text-ink-500 hover:underline">Limpiar</Link>}
          </form>
          {view === "list" && canEdit && <QuickAddTask workspaceId={ctx.ws.id} projects={[{ id, name: project.name }]} members={assignable} />}
          {view === "list" && <TaskListView tasks={filtered} base={lb} workspaceId={ctx.ws.id} canToggle={canToggle} />}
          {view === "board" && <KanbanBoard workspaceId={ctx.ws.id} tasks={filtered.filter((t) => !t.parent_id)} linkBase={lb} canEdit={canEdit}
            quickAdd={{ projects: [{ id, name: project.name }], members: assignable.map((m) => ({ id: m.id, name: m.name })) }} />}
          {view === "calendar" && <TaskMonthCalendar tasks={filtered} month={sp.month ?? todayStr().slice(0, 7)} base={lb} navBase={linkBase(path, { ...sp, month: undefined })} />}
        </div>
      )}

      {view === "files" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card p-5"><h2 className="mb-4 font-semibold">Archivos del proyecto</h2><Attachments ctx={w} type="project" id={id} canEdit={canEdit} /></section>
          <ProjectDocs ctx={ctx} projectId={id} canEdit={canEdit} base={base} />
        </div>
      )}

      {view === "people" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card p-5">
            <h2 className="mb-1 font-semibold">Participantes con acceso directo</h2>
            <p className="mb-3 text-sm text-ink-500">
              {project.visibility === "workspace" ? "Además, los colaboradores y líderes del espacio pueden ver este proyecto (sólo lectura)." : "Proyecto privado: sólo lo ven los participantes, administradores y el equipo asignado."}
              {project.team_name && ` Los integrantes del equipo «${project.team_name}» pueden editarlo.`}
            </p>
            <ProjectMembers workspaceId={ctx.ws.id} projectId={id} canManage={canAdmin} members={members}
              candidates={allMembers.filter((m) => !members.some((pm) => pm.user_id === m.id)).map((m) => ({ id: m.id, name: m.name }))} />
          </section>
          <section className="card p-5">
            <h2 className="mb-1 font-semibold">Enlace público de sólo lectura</h2>
            {canAdmin && ctx.role !== "guest" ? <PublicLinks workspaceId={ctx.ws.id} type="project" id={id} canManage /> : <p className="text-sm text-ink-500">Sólo los administradores del proyecto pueden crear enlaces públicos.</p>}
            <h3 className="mb-2 mt-6 text-sm font-semibold">Niveles de permiso</h3>
            <ul className="space-y-1 text-sm text-ink-600">
              {(Object.keys(PROJECT_ROLE_LABEL) as ProjectRole[]).map((r) => (
                <li key={r}><b>{PROJECT_ROLE_LABEL[r]}:</b> {r === "viewer" ? "ver proyecto, tareas y archivos." : r === "editor" ? "crear y editar tareas, subir archivos y documentos." : "todo lo anterior + compartir, editar y eliminar el proyecto."}</li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {view === "settings" && canEdit && (
        <div className="mx-auto max-w-2xl space-y-6">
          <section className="card p-5 sm:p-6">
            <h2 className="mb-4 font-semibold">Editar proyecto</h2>
            <ProjectForm action={updateProject} workspaceId={ctx.ws.id} submitLabel="Guardar cambios" canAdmin={canAdmin}
              members={allMembers.filter((m) => m.role !== "guest")} teams={teams} initial={project} />
          </section>
          {canAdmin && (
            <section className="card border-rose-200 p-5 ring-rose-200">
              <h2 className="font-semibold text-rose-700">Zona de peligro</h2>
              <p className="mb-3 mt-1 text-sm text-ink-500">Eliminar el proyecto borra sus tareas, comentarios y archivos de forma permanente.</p>
              <ActionForm action={deleteProject} hidden={{ workspaceId: ctx.ws.id, projectId: id }} confirm={`¿Eliminar definitivamente «${project.name}»?`}>
                <SubmitButton className="btn-danger">Eliminar proyecto</SubmitButton>
              </ActionForm>
            </section>
          )}
        </div>
      )}

      {sp.task && <TaskDrawer ctx={ctx} taskId={sp.task} closeHref={closeHref} base={base} />}
    </>
  );
}

async function ProjectDocs({ ctx, projectId, canEdit, base }: { ctx: Awaited<ReturnType<typeof getWsContext>>; projectId: string; canEdit: boolean; base: string }) {
  const docs = await sql<{ id: string; title: string; icon: string; updated_at: Date }[]>`
    select id, title, icon, updated_at from documents where project_id = ${projectId} and not is_folder and document_access_level(${ctx.user.id}, id) >= 1 order by updated_at desc`;
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">Documentos vinculados</h2>
        {canEdit && (
          <ActionForm action={createDocument} hidden={{ workspaceId: ctx.ws.id, projectId, isFolder: "0" }}><SubmitButton className="btn-secondary btn-sm px-2.5 py-1.5">Nuevo documento</SubmitButton></ActionForm>
        )}
      </div>
      {docs.length === 0 ? <EmptyState title="Sin documentos" text="Crea notas, actas o especificaciones vinculadas a este proyecto." /> : (
        <ul className="divide-y divide-ink-100">
          {docs.map((d) => <li key={d.id}><Link href={`${base}/docs/${d.id}`} className="flex items-center gap-2 py-2 text-sm hover:underline"><span>{d.icon}</span><span className="flex-1 truncate">{d.title}</span><span className="text-xs text-ink-400">{new Date(d.updated_at).toLocaleDateString("es")}</span></Link></li>)}
        </ul>
      )}
    </section>
  );
}

async function Milestones({ ctx, projectId, canEdit }: { ctx: Awaited<ReturnType<typeof getWsContext>>; projectId: string; canEdit: boolean }) {
  const from = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const to = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
  const events = await listEvents(ctx, from, to, projectId);
  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Hitos y reuniones</h2>
        {canEdit && <Modal title="Nuevo hito o reunión" trigger="Añadir" triggerClassName="btn-secondary btn-sm px-2.5 py-1">{<EventForm action={createEvent} workspaceId={ctx.ws.id} projects={[{ id: projectId, name: "" }]} fixedProject />}</Modal>}
      </div>
      {events.length === 0 ? <p className="text-sm text-ink-500">Sin hitos ni reuniones programadas.</p> : (
        <ul className="space-y-2 text-sm">
          {events.map((e) => (
            <li key={e.id} className="flex items-center gap-2">
              <span>{e.kind === "milestone" ? "🏁" : "📅"}</span><span className="flex-1 truncate">{e.title}</span>
              <span className="text-xs text-ink-500">{new Date(e.starts_at).toLocaleDateString("es", { day: "numeric", month: "short" })}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
