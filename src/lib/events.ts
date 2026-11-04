import "server-only";
import { sql } from "./db";
import { appUrl, sendMail } from "./mail";

export async function logActivity(a: {
  workspaceId: string | null;
  projectId?: string | null;
  actorId: string | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  summary: string;
  details?: Record<string, unknown>;
}) {
  await sql`insert into activity_log (workspace_id, project_id, actor_id, entity_type, entity_id, action, summary, details)
    values (${a.workspaceId}, ${a.projectId ?? null}, ${a.actorId}, ${a.entityType}, ${a.entityId ?? null}, ${a.action}, ${a.summary},
            ${sql.json((a.details ?? {}) as Parameters<typeof sql.json>[0])})`;
}

/** Crea notificaciones internas (y correo si hay SMTP) para los usuarios indicados, excepto el actor. */
export async function notify(
  userIds: (string | null | undefined)[],
  n: { workspaceId: string; actorId: string; kind: string; title: string; body?: string; link?: string },
) {
  const ids = [...new Set(userIds.filter((x): x is string => Boolean(x) && x !== n.actorId))];
  if (!ids.length) return;
  const rows = ids.map((user_id) => ({
    user_id,
    workspace_id: n.workspaceId,
    kind: n.kind,
    title: n.title,
    body: n.body ?? "",
    link: n.link ?? "",
  }));
  await sql`insert into notifications ${sql(rows, "user_id", "workspace_id", "kind", "title", "body", "link")}`;
  if (process.env.SMTP_HOST && process.env.EMAIL_NOTIFICATIONS !== "false") {
    const users = await sql<{ email: string }[]>`select email from users where id in ${sql(ids)}`;
    await Promise.all(users.map((u) => sendMail(u.email, n.title, `${n.body ?? ""}\n\n${appUrl()}${n.link ?? ""}`)));
  }
}

const MENTION_RE = /@\[([^\]]{1,80})\]\(([0-9a-f-]{36})\)/g;
export function extractMentions(text: string): string[] {
  return [...text.matchAll(MENTION_RE)].map((m) => m[2]);
}
