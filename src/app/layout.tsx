import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Orbita", template: "%s · Orbita" },
  description: "Gestión colaborativa de proyectos, tareas, equipos y documentos.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#2a4ee0" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
      </head>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
