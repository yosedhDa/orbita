import "server-only";
import nodemailer from "nodemailer";

export function mailEnabled() {
  return Boolean(process.env.SMTP_HOST);
}

export function appUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Envía un correo si hay SMTP configurado. Devuelve true si se envió. */
export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  if (!mailEnabled()) return false;
  try {
    const port = Number(process.env.SMTP_PORT ?? 587);
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    await transport.sendMail({ from: process.env.SMTP_FROM ?? "Orbita <no-reply@localhost>", to, subject, text });
    return true;
  } catch (e) {
    console.error("[mail] error enviando correo", e);
    return false;
  }
}
