"use client";
import { Printer } from "lucide-react";

export function PrintButton({ label = "Exportar PDF" }: { label?: string }) {
  return (
    <button type="button" className="btn-secondary no-print" onClick={() => window.print()} title="Abre el diálogo de impresión; elige «Guardar como PDF»">
      <Printer className="h-4 w-4" />{label}
    </button>
  );
}
