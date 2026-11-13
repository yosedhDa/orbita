import "server-only";
import { sql } from "./db";
import { logActivity, notify } from "./events";
import { PRIORITY_LABEL, STATUS_LABEL, type Priority, type TaskStatus } from "./labels";

export type AutomationEvent =
  | { type: "task_created"; taskId: string }
  | { type: "status_changed"; taskId: string; status: TaskStatus };

type Rule = { id: string; name: string; trigger: string; trigger_status: TaskStatus | null; action: string; action_value: string };
type Actor = { id: string; name: string };
type Ws = { id: string; slug: string };

const MAX_DEPTH = 3;

/**
 * Ejecuta las automatizaciones habilitadas del proyecto de la tarea para un evento.
 * Las acciones se aplican con los permisos de la regla (creada por un administrador del proyecto)
 * y quedan registradas en el historial. Un cambio de estado provocado por una regla puede disparar
 * otras reglas, con un límite de profundidad para evitar bucles.
 */
export async function runAutomations(ws: Ws, actor: Actor, ev: AutomationEvent, depth = 0): Promise<void> {
  if (depth >= MAX_DEPTH) return;
  const [task] = await sql<{ id: string; title: string; project_id: string; status: TaskStatus; assignee_id: string | null }[]>`
    select id, title, project_id, status, assignee_id from tasks where id = ${ev.taskId} and workspace_id = ${ws.id}`;
  if (!task) return;
  const rules = await sql<Rule[]>`select id, name, trigger, trigger_status, action, action_value from automations
    where project_id = ${task.project_id} and enabled and trigger = ${ev.type}
      ${ev.type === "status_changed" ? sql`and (trigger_status is null or trigger_status = ${ev.status})` : sql``}
    order by created_at`;
  const link = `/w/${ws.slug}/projects/${task.project_id}?task=${task.id}`;

  for (const r of rules) {
    try {
      let summary = "";
      switch (r.action) {
        case "set_assignee": {
          // Sólo se asigna a personas con acceso al proyecto
          const ok = await sql`select 1 from workspace_members where workspace_id = ${ws.id} and user_id = ${r.action_value}
            and project_access_level(user_id, ${task.project_id}) >= 1`;
          if (!ok.length || task.assignee_id === r.action_value) continue;
          await sql`update tasks set assignee_id = ${r.action_value}, updated_at = now() where id = ${task.id}`;
          const [u] = await sql<{ name: string }[]>`select name from users where id = ${r.action_value}`;
          await notify([r.action_value], { workspaceId: ws.id, actorId: "00000000-0000-0000-0000-000000000000", kind: "assignment", title: `Se te asignó «${task.title}» (automatización)`, link });
          summary = `asignó «${task.title}» a ${u.name}`;
          break;
        }
        case "set_priority": {
          if (!["high", "medium", "low"].includes(r.action_value)) continue;
          await sql`update tasks set priority = ${r.action_value}, updated_at = now() where id = ${task.id}`;
          summary = `cambió la prioridad de «${task.title}» a ${PRIORITY_LABEL[r.action_value as Priority]}`;
          break;
        }
        case "set_status": {
          const st = r.action_value as TaskStatus;
          if (!STATUS_LABEL[st]) continue;
          const [cur] = await sql<{ status: TaskStatus }[]>`select status from tasks where id = ${task.id}`;
          if (cur.status === st) continue;
          await sql`update tasks set status = ${st}, updated_at = now(),
            completed_at = case when ${st} = 'done' then coalesce(completed_at, now()) else null end where id = ${task.id}`;
          summary = `movió «${task.title}» a ${STATUS_LABEL[st]}`;
          await record(ws, actor, task.project_id, task.id, r, summary);
          await runAutomations(ws, actor, { type: "status_changed", taskId: task.id, status: st }, depth + 1);
          continue;
        }
        case "notify_user": {
          const ok = await sql`select 1 from workspace_members where workspace_id = ${ws.id} and user_id = ${r.action_value}
            and project_access_level(user_id, ${task.project_id}) >= 1`;
          if (!ok.length) continue;
          const what = ev.type === "task_created" ? "Nueva tarea" : `Tarea en ${STATUS_LABEL[ev.status]}`;
          await notify([r.action_value], { workspaceId: ws.id, actorId: "00000000-0000-0000-0000-000000000000", kind: "automation", title: `${what}: «${task.title}»`, body: `Regla «${r.name}»`, link });
          summary = `notificó sobre «${task.title}»`;
          break;
        }
        case "add_checklist": {
          const items = r.action_value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 20);
          for (const text of items) {
            await sql`insert into checklist_items (task_id, text, position)
              values (${task.id}, ${text.slice(0, 300)}, (select coalesce(max(position), 0) + 1 from checklist_items where task_id = ${task.id}))`;
          }
          summary = `añadió ${items.length} elemento(s) al checklist de «${task.title}»`;
          break;
        }
        case "add_comment": {
          if (!r.action_value.trim()) continue;
          await sql`insert into comments (workspace_id, entity_type, entity_id, author_id, body)
            values (${ws.id}, 'task', ${task.id}, null, ${`🤖 ${r.action_value.slice(0, 2000)}`})`;
          summary = `comentó en «${task.title}»`;
          break;
        }
        default:
          continue;
      }
      await record(ws, actor, task.project_id, task.id, r, summary);
    } catch (e) {
      console.error(`[automation ${r.id}]`, e);
    }
  }
}

async function record(ws: Ws, actor: Actor, projectId: string, taskId: string, r: Rule, summary: string) {
  await sql`update automations set run_count = run_count + 1, last_run_at = now() where id = ${r.id}`;
  await logActivity({ workspaceId: ws.id, projectId, actorId: actor.id, entityType: "task", entityId: taskId, action: "automation.run",
    summary: `⚡ automatización «${r.name}»: ${summary}`, details: { automationId: r.id } });
}
