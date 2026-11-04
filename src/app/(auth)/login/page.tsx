import Link from "next/link";
import { redirect } from "next/navigation";
import { login } from "@/actions/auth";
import { ActionForm, SubmitButton } from "@/components/forms";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Iniciar sesión" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getCurrentUser()) redirect(next?.startsWith("/") ? next : "/");
  return (
    <>
      <h1 className="text-lg font-semibold">Inicia sesión</h1>
      <p className="mb-6 mt-1 text-sm text-ink-500">Bienvenido de nuevo.</p>
      <ActionForm action={login} className="space-y-4" hidden={{ next }}>
        <div><label className="label" htmlFor="email">Correo electrónico</label><input id="email" name="email" type="email" required autoComplete="email" className="input" /></div>
        <div>
          <div className="flex items-center justify-between"><label className="label" htmlFor="password">Contraseña</label>
            <Link href="/forgot-password" className="mb-1 text-xs text-brand-600 hover:underline">¿La olvidaste?</Link></div>
          <input id="password" name="password" type="password" required autoComplete="current-password" className="input" />
        </div>
        <SubmitButton className="btn-primary w-full">Entrar</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm text-ink-500">¿No tienes cuenta? <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-brand-600 hover:underline">Regístrate</Link></p>
    </>
  );
}
