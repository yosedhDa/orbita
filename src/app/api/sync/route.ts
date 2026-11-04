import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sondeo ligero de cambios: versión de actividad del espacio + notificaciones sin leer. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const ws = req.nextUrl.searchParams.get("ws") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(ws)) return NextResponse.json({ error: "ws" }, { status: 400 });
  const [r] = await sql<{ v: string | null; unread: number; member: boolean }[]>`
    select (select max(id)::text from activity_log where workspace_id = ${ws}) as v,
           (select count(*)::int from notifications where user_id = ${user.id} and read_at is null) as unread,
           exists (select 1 from workspace_members where workspace_id = ${ws} and user_id = ${user.id}) as member`;
  if (!r.member) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  return NextResponse.json({ v: r.v ?? "0", unread: r.unread }, { headers: { "Cache-Control": "no-store" } });
}
