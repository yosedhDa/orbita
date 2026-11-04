"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { hashPassword, verifyPassword, randomToken, sha256 } from "@/lib/crypto";
import { createSession, destroySession, rateLimit, clientIp } from "@/lib/auth";
import { safeAction, UserError } from "@/lib/action";
import { logActivity } from "@/lib/events";
import { appUrl, mailEnabled, sendMail } from "@/lib/mail";
import { PALETTE } from "@/lib/labels";

const email = z.string().trim().toLowerCase().email("Correo electrónico no válido").max(200);
const password = z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(200);

function safeNext(next: FormDataEntryValue | null) {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/";
}

export const register = safeAction(async (fd) => {
  const data = z
    .object({ name: z.string().trim().min(2, "Indica tu nombre").max(80), email, password })
    .parse({ name: fd.get("name"), email: fd.get("email"), password: fd.get("password") });
  if (!(await rateLimit(`register:${await clientIp()}`, 20, 60))) throw new UserError("Demasiados intentos. Espera unos minutos.");
  const exists = await sql`select 1 from users where lower(email) = ${data.email}`;
  if (exists.length) throw new UserError("Ya existe una cuenta con ese correo");
  const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
  const [u] = await sql<{ id: string }[]>`insert into users (email, name, password_hash, avatar_color)
    values (${data.email}, ${data.name}, ${await hashPassword(data.password)}, ${color}) returning id`;
  await logActivity({ workspaceId: null, actorId: u.id, entityType: "user", entityId: u.id, action: "user.registered", summary: "Cuenta creada" });
  await createSession(u.id);
  redirect(safeNext(fd.get("next")));
});

export const login = safeAction(async (fd) => {
  const data = z.object({ email, password: z.string().min(1, "Indica tu contraseña") })
    .parse({ email: fd.get("email"), password: fd.get("password") });
  const ip = await clientIp();
  if (!(await rateLimit(`login:${ip}:${data.email}`, 10, 15)))
    throw new UserError("Demasiados intentos fallidos. Espera 15 minutos.");
  const [u] = await sql<{ id: string; password_hash: string }[]>`select id, password_hash from users where lower(email) = ${data.email}`;
  const valid = u ? await verifyPassword(data.password, u.password_hash) : false;
  if (!u || !valid) {
    if (u) await logActivity({ workspaceId: null, actorId: u.id, entityType: "user", entityId: u.id, action: "auth.login_failed", summary: `Inicio de sesión fallido desde ${ip}` });
    throw new UserError("Correo o contraseña incorrectos");
  }
  await sql`delete from login_attempts where key = ${`login:${ip}:${data.email}`}`;
  await createSession(u.id);
  await logActivity({ workspaceId: null, actorId: u.id, entityType: "user", entityId: u.id, action: "auth.login", summary: `Inicio de sesión desde ${ip}` });
  redirect(safeNext(fd.get("next")));
});

export async function logout() {
  await destroySession();
  redirect("/login");
}

export const requestPasswordReset = safeAction(async (fd) => {
  const data = z.object({ email }).parse({ email: fd.get("email") });
  if (!(await rateLimit(`reset:${await clientIp()}`, 10, 60))) throw new UserError("Demasiadas solicitudes. Espera unos minutos.");
  const [u] = await sql<{ id: string; email: string }[]>`select id, email from users where lower(email) = ${data.email}`;
  const generic = "Si existe una cuenta con ese correo, te enviamos un enlace para restablecer la contraseña (válido 1 hora).";
  if (!u) return { ok: true, message: generic };
  const token = randomToken();
  await sql`insert into password_resets (token_hash, user_id, expires_at) values (${sha256(token)}, ${u.id}, now() + interval '1 hour')`;
  const link = `${appUrl()}/reset-password/${token}`;
  const sent = await sendMail(u.email, "Restablecer tu contraseña de Orbita",
    `Hola,\n\nPara crear una nueva contraseña abre este enlace (válido 1 hora):\n${link}\n\nSi no lo solicitaste, ignora este mensaje.`);
  if (!sent) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[dev] Enlace de recuperación para ${u.email}: ${link}`);
      return { ok: true, message: `${generic} (Modo desarrollo sin SMTP: el enlace se imprimió en la consola del servidor.)` };
    }
    if (!mailEnabled()) console.warn("[reset] SMTP no configurado: no se pudo enviar el correo de recuperación");
  }
  return { ok: true, message: generic };
});

export const resetPassword = safeAction(async (fd) => {
  const data = z.object({ token: z.string().min(10), password }).parse({ token: fd.get("token"), password: fd.get("password") });
  const [r] = await sql<{ user_id: string }[]>`
    update password_resets set used_at = now()
    where token_hash = ${sha256(data.token)} and used_at is null and expires_at > now()
    returning user_id`;
  if (!r) throw new UserError("El enlace no es válido o ha caducado. Solicita uno nuevo.");
  await sql`update users set password_hash = ${await hashPassword(data.password)} where id = ${r.user_id}`;
  await sql`delete from sessions where user_id = ${r.user_id}`;
  await logActivity({ workspaceId: null, actorId: r.user_id, entityType: "user", entityId: r.user_id, action: "auth.password_reset", summary: "Contraseña restablecida" });
  await createSession(r.user_id);
  redirect("/");
});

export const updateProfile = safeAction(async (fd) => {
  const { requireUser } = await import("@/lib/auth");
  const user = await requireUser();
  const data = z.object({
    name: z.string().trim().min(2).max(80),
    current: z.string().optional(),
    next: z.string().optional(),
  }).parse({ name: fd.get("name"), current: fd.get("current") || undefined, next: fd.get("next") || undefined });
  await sql`update users set name = ${data.name} where id = ${user.id}`;
  if (data.next) {
    password.parse(data.next);
    const [u] = await sql<{ password_hash: string }[]>`select password_hash from users where id = ${user.id}`;
    if (!data.current || !(await verifyPassword(data.current, u.password_hash))) throw new UserError("La contraseña actual no es correcta");
    await sql`update users set password_hash = ${await hashPassword(data.next)} where id = ${user.id}`;
    const { revokeOtherSessions } = await import("@/lib/auth");
    await revokeOtherSessions(user.id);
    await logActivity({ workspaceId: null, actorId: user.id, entityType: "user", entityId: user.id, action: "auth.password_changed", summary: "Contraseña cambiada" });
  }
  return { ok: true, message: "Perfil actualizado" };
});
