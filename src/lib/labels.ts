// Etiquetas y colores compartidos (cliente y servidor)
export type WorkspaceRole = "admin" | "leader" | "member" | "guest";
export type TaskStatus = "pending" | "in_progress" | "in_review" | "done";
export type Priority = "high" | "medium" | "low";
export type ProjectStatus = "active" | "on_hold" | "completed" | "archived";
export type ProjectRole = "viewer" | "editor" | "admin";

export const ROLE_LABEL: Record<WorkspaceRole, string> = {
  admin: "Administrador",
  leader: "Líder de equipo",
  member: "Colaborador",
  guest: "Invitado",
};
export const ROLE_DESC: Record<WorkspaceRole, string> = {
  admin: "Control total del espacio",
  leader: "Gestiona sus equipos y los proyectos autorizados",
  member: "Gestiona tareas y proyectos asignados",
  guest: "Sólo ve el contenido compartido con él",
};

export const PROJECT_ROLE_LABEL: Record<ProjectRole, string> = {
  viewer: "Lectura",
  editor: "Edición",
  admin: "Administración",
};

export const STATUS_ORDER: TaskStatus[] = ["pending", "in_progress", "in_review", "done"];
export const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: "Pendiente",
  in_progress: "En progreso",
  in_review: "En revisión",
  done: "Completada",
};
export const STATUS_STYLE: Record<TaskStatus, { badge: string; dot: string; hex: string }> = {
  pending: { badge: "bg-slate-100 text-slate-700", dot: "bg-slate-400", hex: "#94a3b8" },
  in_progress: { badge: "bg-blue-50 text-blue-700", dot: "bg-blue-500", hex: "#3b82f6" },
  in_review: { badge: "bg-amber-50 text-amber-700", dot: "bg-amber-500", hex: "#f59e0b" },
  done: { badge: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500", hex: "#10b981" },
};

export const PRIORITY_LABEL: Record<Priority, string> = { high: "Alta", medium: "Media", low: "Baja" };
export const PRIORITY_STYLE: Record<Priority, string> = {
  high: "bg-rose-50 text-rose-700 ring-rose-200",
  medium: "bg-orange-50 text-orange-700 ring-orange-200",
  low: "bg-sky-50 text-sky-700 ring-sky-200",
};

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  active: "Activo",
  on_hold: "En pausa",
  completed: "Finalizado",
  archived: "Archivado",
};
export const PROJECT_STATUS_STYLE: Record<ProjectStatus, string> = {
  active: "bg-blue-50 text-blue-700",
  on_hold: "bg-amber-50 text-amber-700",
  completed: "bg-emerald-50 text-emerald-700",
  archived: "bg-slate-100 text-slate-600",
};

export const PALETTE = ["#3b66f0", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#0891b2", "#ca8a04", "#475569"];
