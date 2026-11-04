import { resetPassword } from "@/actions/auth";
import { ActionForm, SubmitButton } from "@/components/forms";

export const metadata = { title: "Nueva contraseña" };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <>
      <h1 className="text-lg font-semibold">Crea una nueva contraseña</h1>
      <p className="mb-6 mt-1 text-sm text-ink-500">Se cerrarán las sesiones abiertas en otros dispositivos.</p>
      <ActionForm action={resetPassword} className="space-y-4" hidden={{ token }}>
        <div><label className="label" htmlFor="password">Nueva contraseña</label><input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" className="input" /></div>
        <SubmitButton className="btn-primary w-full">Guardar contraseña</SubmitButton>
      </ActionForm>
    </>
  );
}
