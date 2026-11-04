import Link from "next/link";
import { redirect } from "next/navigation";
import { register } from "@/actions/auth";
import { ActionForm, SubmitButton } from "@/components/forms";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Crear cuenta" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string; email?: string }> }) {
  const { next, email } = await searchParams;
  if (await getCurrentUser()) redirect(next?.startsWith("/") ? next : "/");
  return (
    <>
      <h1 className="text-lg font-semibold">Crea tu cuenta</h1>
      <p className="mb-6 mt-1 text-sm text-ink-500">Empieza a organizar el trabajo de tu equipo.</p>
      <ActionForm action={register} className="space-y-4" hidden={{ next }}>
        <div><label className="label" htmlFor="name">Nombre completo</label><input id="name" name="name" required minLength={2} autoComplete="name" className="input" /></div>
        <div><label className="label" htmlFor="email">Correo electrónico</label><input id="email" name="email" type="email" required defaultValue={email} autoComplete="email" className="input" /></div>
        <div><label className="label" htmlFor="password">Contraseña</label><input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className="input" />
          <p className="mt-1 text-xs text-ink-400">Mínimo 8 caracteres.</p></div>
        <SubmitButton className="btn-primary w-full">Crear cuenta</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm text-ink-500">¿Ya tienes cuenta? <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-brand-600 hover:underline">Inicia sesión</Link></p>
    </>
  );
}
