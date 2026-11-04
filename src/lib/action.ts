import "server-only";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { AccessError } from "./access";

export type ActionResult = { ok?: boolean; error?: string; message?: string; data?: Record<string, unknown> } | null;

export class UserError extends Error {}

/** Envuelve una acción de servidor y convierte errores esperados en mensajes para la interfaz. */
export function safeAction(fn: (fd: FormData) => Promise<ActionResult | void>) {
  return async (_prev: ActionResult, fd: FormData): Promise<ActionResult> => {
    try {
      return (await fn(fd)) ?? { ok: true };
    } catch (e) {
      unstable_rethrow(e);
      if (e instanceof AccessError || e instanceof UserError) return { error: e.message };
      if (e instanceof ZodError) return { error: e.issues.map((i) => i.message).join(". ") };
      console.error("[action]", e);
      return { error: "Ocurrió un error inesperado. Inténtalo de nuevo." };
    }
  };
}
