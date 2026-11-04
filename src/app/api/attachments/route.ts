import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { LEVEL, entityLevel, type WsContext } from "@/lib/access";
import { logActivity } from "@/lib/events";
import type { WorkspaceRole } from "@/lib/labels";

export const runtime = "nodejs";
// Límite compatible con funciones serverless de Vercel (4,5 MB por petición)
const MAX_BYTES = Number(process.env.MAX_UPLOAD_MB ?? 4) * 1024 * 1024;

function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try { return new URL(origin).host === host; } catch { return false; }
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const fd = await req.formData();
  const parsed = z.object({
    workspaceId: z.string().uuid(),
    entityType: z.enum(["project", "task", "document"]),
    entityId: z.string().uuid(),
  }).safeParse({ workspaceId: fd.get("workspaceId"), entityType: fd.get("entityType"), entityId: fd.get("entityId") });
  const file = fd.get("file");
  if (!parsed.success || !(file instanceof File)) return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: `El archivo supera el máximo de ${MAX_BYTES / 1024 / 1024} MB` }, { status: 413 });

  const [m] = await sql<{ id: string; name: string; slug: string; role: WorkspaceRole }[]>`
    select w.id, w.name, w.slug, wm.role from workspaces w join workspace_members wm on wm.workspace_id = w.id
    where w.id = ${parsed.data.workspaceId} and wm.user_id = ${user.id}`;
  if (!m) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  const ctx: WsContext = { user, ws: { id: m.id, name: m.name, slug: m.slug }, role: m.role };
  const e = await entityLevel(ctx, parsed.data.entityType, parsed.data.entityId);
  if (e.level < LEVEL.edit) return NextResponse.json({ error: "No tienes permiso para adjuntar archivos aquí" }, { status: 403 });

  const name = file.name.replace(/[\r\n"\\/]/g, "_").slice(0, 200) || "archivo";
  const buf = Buffer.from(await file.arrayBuffer());
  const [a] = await sql<{ id: string }[]>`insert into attachments (workspace_id, entity_type, entity_id, filename, mime_type, size_bytes, data, uploaded_by)
    values (${m.id}, ${parsed.data.entityType}, ${parsed.data.entityId}, ${name}, ${(file.type || "application/octet-stream").slice(0, 100)}, ${file.size}, ${buf}, ${user.id})
    returning id`;
  await logActivity({ workspaceId: m.id, projectId: e.projectId, actorId: user.id, entityType: parsed.data.entityType, entityId: parsed.data.entityId,
    action: "attachment.created", summary: `adjuntó «${name}» en «${e.title}»` });
  return NextResponse.json({ ok: true, id: a.id });
}
