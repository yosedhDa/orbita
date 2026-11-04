import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-brand-50 to-ink-50 px-4 py-10">
      <Link href="/" className="mb-8"><Logo className="text-xl" /></Link>
      <div className="card w-full max-w-sm p-6 sm:p-8">{children}</div>
      <p className="mt-6 max-w-sm text-center text-xs text-ink-500">Proyectos, tareas, equipos y documentos en un solo lugar.</p>
    </div>
  );
}
