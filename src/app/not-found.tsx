import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-5xl font-bold text-ink-200">404</p>
      <h1 className="mt-3 text-lg font-semibold">No encontrado</h1>
      <p className="mt-1 max-w-sm text-sm text-ink-500">La página no existe o no tienes permiso para verla.</p>
      <Link href="/" className="btn-primary mt-6">Ir al inicio</Link>
    </div>
  );
}
