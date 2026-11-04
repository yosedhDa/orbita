// Aplica las migraciones SQL pendientes de db/migrations (una sola vez cada una).
import postgres from "postgres";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}
const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL no está definido"); process.exit(1); }
const sql = postgres(url, { ssl: process.env.DATABASE_SSL === "true" ? "require" : undefined, max: 1, prepare: process.env.DATABASE_PREPARE !== "false", onnotice: () => {} });

try {
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const dir = join(process.cwd(), "db", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const applied = new Set((await sql`select name from schema_migrations`).map((r) => r.name));
  for (const f of files) {
    if (applied.has(f)) continue;
    const body = readFileSync(join(dir, f), "utf8");
    await sql.begin(async (tx) => { await tx.unsafe(body); await tx`insert into schema_migrations (name) values (${f})`; });
    console.log(`✔ migración aplicada: ${f}`);
  }
  console.log("Base de datos al día.");
} catch (e) { console.error(e); process.exitCode = 1; }
await sql.end();
