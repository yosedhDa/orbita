import Link from "next/link";
import { requestPasswordReset } from "@/actions/auth";
import { ActionForm, SubmitButton } from "@/components/forms";

export const metadata = { title: "Recuperar contraseña" };

export default function ForgotPage() {
  return (
    <>
      <h1 className="text-lg font-semibold">Recupera tu contraseña</h1>
      <p className="mb-6 mt-1 text-sm text-ink-500">Te enviaremos un enlace para crear una nueva.</p>
      <ActionForm action={requestPasswordReset} className="space-y-4">
        <div><label className="label" htmlFor="email">Correo electrónico</label><input id="email" name="email" type="email" required className="input" /></div>
        <SubmitButton className="btn-primary w-full">Enviar enlace</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm"><Link href="/login" className="text-brand-600 hover:underline">Volver a iniciar sesión</Link></p>
    </>
  );
}
