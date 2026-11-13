import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { mailEnabled } from "@/lib/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Diagnóstico tras publicar: confirma que la app arranca, conecta con PostgreSQL y
 * tiene las migraciones aplicadas. No expone datos ni credenciales.
 */
export async function GET() {
  const started = Date.now();
  try {
    const migrations = await sql<{ name: string }[]>`select name from schema_migrations order by name`;
    const [{ users }] = await sql<{ users: number }[]>`select count(*)::int as users from users`;
    return NextResponse.json(
      {
        status: "ok",
        database: "ok",
        latency_ms: Date.now() - started,
        migrations: migrations.map((m) => m.name),
        has_users: users > 0,
        email: mailEnabled() ? "configurado" : "no configurado",
        app_url_set: Boolean(process.env.APP_URL),
        timezone: process.env.APP_TIMEZONE || "UTC",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const code = (e as { code?: string }).code;
    console.error("[health]", e);
    const hint =
      code === "42P01" ? "Faltan las tablas: ejecuta las migraciones (npm run db:migrate)." :
      code === "28P01" ? "Usuario o contraseña de la base de datos incorrectos (revisa DATABASE_URL)." :
      code === "ENOTFOUND" || code === "ECONNREFUSED" ? "No se puede conectar con el servidor de base de datos (revisa el host y el puerto de DATABASE_URL)." :
      !process.env.DATABASE_URL ? "Falta la variable DATABASE_URL." :
      "Error de base de datos. Revisa DATABASE_URL y DATABASE_SSL=true; detalles en los registros del servidor.";
    return NextResponse.json({ status: "error", database: "error", code: code ?? null, hint }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
