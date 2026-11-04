import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { Logo } from "@/components/Logo";
import { CheckCircle2, KanbanSquare, Users, FileText, CalendarDays, ShieldCheck } from "lucide-react";

export default async function Home() {
  const user = await getCurrentUser();
  if (user) {
    const [ws] = await sql<{ slug: string }[]>`select w.slug from workspace_members wm join workspaces w on w.id = wm.workspace_id
      where wm.user_id = ${user.id} order by wm.joined_at limit 1`;
    redirect(ws ? `/w/${ws.slug}` : "/onboarding");
  }
  const features = [
    { icon: KanbanSquare, t: "Proyectos y tareas", d: "Lista, tablero Kanban y calendario con arrastrar y soltar." },
    { icon: Users, t: "Equipos", d: "Líderes, roles, carga de trabajo y actividad por integrante." },
    { icon: FileText, t: "Documentos", d: "Páginas, carpetas y bases de conocimiento con historial." },
    { icon: CalendarDays, t: "Planificación", d: "Vencimientos, hitos, reuniones y cronograma." },
    { icon: CheckCircle2, t: "Seguimiento", d: "Dashboard con avance, alertas y vencimientos." },
    { icon: ShieldCheck, t: "Permisos", d: "Administrador, líder, colaborador e invitado." },
  ];
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 via-white to-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <Logo className="text-lg" />
        <div className="flex gap-2"><Link href="/login" className="btn-ghost">Iniciar sesión</Link><Link href="/register" className="btn-primary">Crear cuenta</Link></div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-12 text-center sm:pt-20">
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-ink-900 sm:text-5xl">El trabajo de tu equipo, en órbita.</h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-ink-600">Organiza proyectos, asigna tareas, documenta y da seguimiento a resultados en una sola plataforma colaborativa.</p>
        <div className="mt-8 flex justify-center gap-3"><Link href="/register" className="btn-primary px-5 py-2.5 text-base">Empezar gratis</Link></div>
        <div className="mt-16 grid gap-4 text-left sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.t} className="card p-5"><f.icon className="h-5 w-5 text-brand-600" /><p className="mt-3 font-semibold">{f.t}</p><p className="mt-1 text-sm text-ink-500">{f.d}</p></div>
          ))}
        </div>
      </main>
    </div>
  );
}
