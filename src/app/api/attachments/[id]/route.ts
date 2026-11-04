import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { LEVEL, entityLevel, type WsContext } from "@/lib/access";
import type { WorkspaceRole } from "@/lib/labels";

export const runtime = "nodejs";
const INLINE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"]);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("No encontrado", { status: 404 });
  const user = await getCurrentUser();
  if (!user) return new NextResponse("No autenticado", { status: 401 });
  const [a] = await sql<{ workspace_id: string; entity_type: string; entity_id: string; filename: string; mime_type: string; data: Buffer; ws_name: string; slug: string; role: WorkspaceRole | null }[]>`
    select a.workspace_id, a.entity_type, a.entity_id, a.filename, a.mime_type, a.data, w.name as ws_name, w.slug, wm.role
    from attachments a join workspaces w on w.id = a.workspace_id
    left join workspace_members wm on wm.workspace_id = a.workspace_id and wm.user_id = ${user.id}
    where a.id = ${id}`;
  if (!a || !a.role) return new NextResponse("No encontrado", { status: 404 });
  const ctx: WsContext = { user, ws: { id: a.workspace_id, name: a.ws_name, slug: a.slug }, role: a.role };
  const e = await entityLevel(ctx, a.entity_type, a.entity_id);
  if (e.level < LEVEL.view) return new NextResponse("No encontrado", { status: 404 });
  const inline = INLINE.has(a.mime_type);
  return new NextResponse(new Uint8Array(a.data), {
    headers: {
      "Content-Type": inline ? a.mime_type : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(a.filename)}`,
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
