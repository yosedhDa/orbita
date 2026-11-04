"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-lg font-semibold">Algo salió mal</h1>
      <p className="mt-1 max-w-sm text-sm text-ink-500">Ocurrió un error inesperado. Si persiste, contacta al administrador.</p>
      <button onClick={reset} className="btn-primary mt-6">Reintentar</button>
    </div>
  );
}
