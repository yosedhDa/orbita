import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { sql } from "./db";
import { randomToken, sha256 } from "./crypto";

export const SESSION_COOKIE = "orbita_session";
const SESSION_DAYS = 30;

export type SessionUser = { id: string; email: string; name: string; avatar_color: string };

export async function createSession(userId: string) {
  const token = randomToken(32);
  const h = await headers();
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  await sql`insert into sessions (user_id, token_hash, user_agent, expires_at)
            values (${userId}, ${sha256(token)}, ${(h.get("user-agent") ?? "").slice(0, 300)}, ${expires})`;
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && !process.env.APP_URL?.startsWith("http://"),
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await sql`delete from sessions where token_hash = ${sha256(token)}`;
  jar.delete(SESSION_COOKIE);
}

/** Usuario autenticado de la petición actual (o null). Memorizado por petición. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await sql<SessionUser[]>`
    select u.id, u.email, u.name, u.avatar_color
    from sessions s join users u on u.id = s.user_id
    where s.token_hash = ${sha256(token)} and s.expires_at > now()`;
  return rows[0] ?? null;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Limitador simple de intentos: máximo `limit` en `windowMin` minutos. */
export async function rateLimit(key: string, limit: number, windowMin: number): Promise<boolean> {
  const [{ count }] = await sql<{ count: number }[]>`
    select count(*)::int as count from login_attempts
    where key = ${key} and created_at > now() - make_interval(mins => ${windowMin})`;
  if (count >= limit) return false;
  await sql`insert into login_attempts (key) values (${key})`;
  if (Math.random() < 0.05) await sql`delete from login_attempts where created_at < now() - interval '1 day'`;
  return true;
}

/** Cierra todas las sesiones del usuario excepto la actual. */
export async function revokeOtherSessions(userId: string) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  await sql`delete from sessions where user_id = ${userId} and token_hash <> ${sha256(token)}`;
}

export async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "local";
}
