"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  LayoutDashboard, FolderKanban, CheckSquare, CalendarDays, Users, FileText, Activity, Bell, Search, Menu, X,
  Settings, UserCog, LogOut, ChevronsUpDown, Plus, Check,
} from "lucide-react";
import { Logo } from "./Logo";
import { Avatar } from "./ui";
import { logout } from "@/actions/auth";
import { ROLE_LABEL, type WorkspaceRole } from "@/lib/labels";

type Props = {
  ws: { id: string; name: string; slug: string };
  role: WorkspaceRole;
  user: { name: string; email: string; avatar_color: string };
  spaces: { name: string; slug: string }[];
  projects: { id: string; name: string; color: string }[];
  unread: number;
  version: string;
  children: React.ReactNode;
};

export function AppShell({ ws, role, user, spaces, projects, unread: initialUnread, version, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const base = `/w/${ws.slug}`;
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => setUnread(initialUnread), [initialUnread]);

  // Sincronización casi en tiempo real: sondeo ligero cada 10 s cuando la pestaña está visible
  const ver = useRef(version);
  useEffect(() => { ver.current = version; }, [version]);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (document.visibilityState !== "visible" || stop) return;
      try {
        const r = await fetch(`/api/sync?ws=${ws.id}`, { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { v: string; unread: number };
        setUnread(j.unread);
        if (j.v !== ver.current) {
          ver.current = j.v;
          // No refrescar mientras el usuario escribe en un formulario
          const el = document.activeElement;
          if (!el || !["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) router.refresh();
        }
      } catch { /* sin conexión */ }
    };
    const id = setInterval(tick, 10_000);
    document.addEventListener("visibilitychange", tick);
    return () => { stop = true; clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [ws.id, router]);

  const nav = [
    { href: base, label: "Dashboard", icon: LayoutDashboard, exact: true },
    { href: `${base}/projects`, label: "Proyectos", icon: FolderKanban },
    { href: `${base}/tasks`, label: "Mis tareas", icon: CheckSquare },
    { href: `${base}/calendar`, label: "Calendario", icon: CalendarDays },
    ...(role !== "guest" ? [{ href: `${base}/teams`, label: "Equipos", icon: Users }] : []),
    { href: `${base}/docs`, label: "Documentos", icon: FileText },
    { href: `${base}/activity`, label: "Actividad", icon: Activity },
    { href: `${base}/members`, label: "Miembros", icon: UserCog },
    ...(role === "admin" ? [{ href: `${base}/settings`, label: "Configuración", icon: Settings }] : []),
  ];
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href));

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-4">
        <Link href={base}><Logo /></Link>
        <button className="btn-ghost p-1.5 lg:hidden" onClick={() => setOpen(false)} aria-label="Cerrar menú"><X className="h-5 w-5" /></button>
      </div>
      <WorkspaceSwitcher ws={ws} role={role} spaces={spaces} />
      <nav className="mt-2 space-y-0.5 px-2">
        {nav.map((n) => (
          <Link key={n.href} href={n.href}
            className={clsx("flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium", isActive(n.href, n.exact) ? "bg-brand-50 text-brand-700" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900")}>
            <n.icon className="h-4 w-4" /> {n.label}
          </Link>
        ))}
      </nav>
      <div className="mt-6 flex items-center justify-between px-5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Proyectos</p>
        {role !== "guest" && <Link href={`${base}/projects/new`} className="text-ink-400 hover:text-ink-700" aria-label="Nuevo proyecto"><Plus className="h-4 w-4" /></Link>}
      </div>
      <div className="mt-1 flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
        {projects.length === 0 && <p className="px-3 py-1 text-xs text-ink-400">Sin proyectos todavía</p>}
        {projects.map((p) => (
          <Link key={p.id} href={`${base}/projects/${p.id}`}
            className={clsx("flex items-center gap-2.5 truncate rounded-lg px-3 py-1.5 text-sm", pathname.startsWith(`${base}/projects/${p.id}`) ? "bg-ink-100 text-ink-900" : "text-ink-600 hover:bg-ink-100")}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-[4px]" style={{ background: p.color }} /> <span className="truncate">{p.name}</span>
          </Link>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-ink-200/70 bg-white lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85%] bg-white shadow-xl">{sidebar}</aside>
        </div>
      )}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-ink-200/70 bg-white/85 px-3 backdrop-blur sm:px-6">
        <button className="btn-ghost p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menú"><Menu className="h-5 w-5" /></button>
        <form action={`${base}/search`} className="relative flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input name="q" placeholder="Buscar proyectos, tareas, documentos…" className="input bg-ink-50 pl-9 ring-transparent focus:bg-white" aria-label="Buscar" />
        </form>
        <div className="ml-auto flex items-center gap-1">
          <Link href={`${base}/notifications`} className="btn-ghost relative p-2" aria-label="Notificaciones">
            <Bell className="h-5 w-5" />
            {unread > 0 && <span data-testid="unread" className="absolute right-1 top-1 min-w-[16px] rounded-full bg-rose-500 px-1 text-center text-[10px] font-semibold leading-4 text-white">{unread > 99 ? "99+" : unread}</span>}
          </Link>
          <UserMenu user={user} />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-3 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}

function WorkspaceSwitcher({ ws, role, spaces }: { ws: Props["ws"]; role: WorkspaceRole; spaces: Props["spaces"] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative px-3">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-ink-100">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-xs font-bold text-white">{ws.name[0]?.toUpperCase()}</span>
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{ws.name}</span><span className="block text-[11px] text-ink-500">{ROLE_LABEL[role]}</span></span>
        <ChevronsUpDown className="h-4 w-4 text-ink-400" />
      </button>
      {open && (
        <div className="absolute left-3 right-3 z-50 mt-1 rounded-lg bg-white p-1 shadow-lg ring-1 ring-ink-200">
          {spaces.map((s) => (
            <Link key={s.slug} href={`/w/${s.slug}`} onClick={() => setOpen(false)} className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-ink-50">
              <span className="truncate">{s.name}</span>{s.slug === ws.slug && <Check className="h-4 w-4 text-brand-600" />}
            </Link>
          ))}
          <Link href="/onboarding" className="mt-1 flex items-center gap-2 border-t border-ink-100 px-2 py-1.5 text-sm text-brand-600 hover:bg-ink-50"><Plus className="h-4 w-4" />Nuevo espacio</Link>
        </div>
      )}
    </div>
  );
}

function UserMenu({ user }: { user: Props["user"] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="rounded-full p-1 hover:bg-ink-100" aria-label="Menú de usuario"><Avatar name={user.name} color={user.avatar_color} size={30} /></button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-60 rounded-lg bg-white p-1 shadow-lg ring-1 ring-ink-200">
            <div className="px-3 py-2"><p className="truncate text-sm font-medium">{user.name}</p><p className="truncate text-xs text-ink-500">{user.email}</p></div>
            <Link href="/account" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-ink-50"><UserCog className="h-4 w-4" />Mi cuenta</Link>
            <form action={logout}><button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"><LogOut className="h-4 w-4" />Cerrar sesión</button></form>
          </div>
        </>
      )}
    </div>
  );
}
