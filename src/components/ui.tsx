import clsx from "clsx";
import {
  PRIORITY_LABEL, PRIORITY_STYLE, PROJECT_STATUS_LABEL, PROJECT_STATUS_STYLE, STATUS_LABEL, STATUS_STYLE,
  type Priority, type ProjectStatus, type TaskStatus,
} from "@/lib/labels";

export function initials(name?: string | null) {
  if (!name) return "?";
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

export function Avatar({ name, color, size = 24, className }: { name?: string | null; color?: string | null; size?: number; className?: string }) {
  return (
    <span
      title={name ?? "Sin asignar"}
      className={clsx("inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white ring-2 ring-white", !name && "!bg-ink-200 !text-ink-500", className)}
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.4), background: color ?? "#94a3b8" }}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ people, max = 4, size = 24 }: { people: { name: string; avatar_color: string }[]; max?: number; size?: number }) {
  return (
    <div className="flex -space-x-1.5">
      {people.slice(0, max).map((p, i) => <Avatar key={i} name={p.name} color={p.avatar_color} size={size} />)}
      {people.length > max && (
        <span className="inline-flex items-center justify-center rounded-full bg-ink-100 text-[10px] font-semibold text-ink-600 ring-2 ring-white" style={{ width: size, height: size }}>
          +{people.length - max}
        </span>
      )}
    </div>
  );
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={clsx("chip", STATUS_STYLE[status].badge)}>
      <span className={clsx("h-1.5 w-1.5 rounded-full", STATUS_STYLE[status].dot)} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={clsx("chip ring-1 ring-inset", PRIORITY_STYLE[priority])}>{PRIORITY_LABEL[priority]}</span>;
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <span className={clsx("chip", PROJECT_STATUS_STYLE[status])}>{PROJECT_STATUS_LABEL[status]}</span>;
}

export function Progress({ value, color, className }: { value: number; color?: string; className?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={clsx("h-1.5 w-full overflow-hidden rounded-full bg-ink-100", className)} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-all" style={{ width: `${v}%`, background: color ?? "#3b66f0" }} />
    </div>
  );
}

export function EmptyState({ title, text, children, icon }: { title: string; text?: string; children?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-ink-200 bg-white/60 px-6 py-12 text-center">
      {icon && <div className="mb-3 text-ink-300">{icon}</div>}
      <p className="font-medium text-ink-800">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-ink-500">{text}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, children }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="h-page truncate">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function percent(done: number, total: number) {
  return total ? Math.round((done / total) * 100) : 0;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function fmtDate(d: string | null | undefined, withYear = false) {
  if (!d) return "";
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return `${day} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ""}`;
}

const TZ = typeof process !== "undefined" ? process.env.APP_TIMEZONE || undefined : undefined;
/** Fecha YYYY-MM-DD en la zona horaria de la aplicación (APP_TIMEZONE). */
export function tzDate(d: Date | string = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));
}
export function tzTime(d: Date | string) {
  return new Intl.DateTimeFormat("es", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(d));
}
export function todayStr() {
  return tzDate();
}

export function DueDate({ date, done }: { date: string | null; done?: boolean }) {
  if (!date) return null;
  const today = todayStr();
  const overdue = !done && date < today;
  const soon = !done && !overdue && date <= tzDate(new Date(Date.now() + 2 * 864e5));
  return (
    <span className={clsx("text-xs whitespace-nowrap", overdue ? "font-medium text-rose-600" : soon ? "text-amber-600" : "text-ink-500")}>
      {date === today ? "Hoy" : fmtDate(date)}
    </span>
  );
}

export function timeAgo(d: Date | string) {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "hace un momento";
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  if (s < 86400 * 30) return `hace ${Math.round(s / 86400)} d`;
  return new Date(d).toLocaleDateString("es");
}

export function fileSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Renderiza texto de comentario con menciones @[Nombre](id) resaltadas (sin HTML). */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(@\[[^\]]+\]\([0-9a-f-]{36}\))/g);
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((p, i) => {
        const m = p.match(/^@\[([^\]]+)\]\(([0-9a-f-]{36})\)$/);
        return m ? <span key={i} className="mention">@{m[1]}</span> : <span key={i}>{p}</span>;
      })}
    </span>
  );
}
