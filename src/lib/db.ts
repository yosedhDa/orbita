import "server-only";
import postgres from "postgres";

declare global {
  // eslint-disable-next-line no-var
  var __orbitaSql: ReturnType<typeof postgres> | undefined;
}

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no está definido");
  return postgres(url, {
    ssl: process.env.DATABASE_SSL === "true" ? "require" : undefined,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idle_timeout: 20,
    // Poner DATABASE_PREPARE=false si se usa un pooler en modo transacción (p.ej. Supabase :6543)
    prepare: process.env.DATABASE_PREPARE !== "false",
    transform: { undefined: null },
  });
}

/** Cliente SQL compartido. Las consultas usan plantillas parametrizadas (sin inyección SQL). */
export const sql = globalThis.__orbitaSql ?? create();
if (process.env.NODE_ENV !== "production") globalThis.__orbitaSql = sql;
