import Link from "next/link";
import { Avatar } from "./ui";
import { StackedBar } from "./charts";
import { STATUS_STYLE } from "@/lib/labels";

export type WorkloadRow = { id: string; name: string; avatar_color: string; pending: number; in_progress: number; in_review: number; overdue: number; done: number };

export function Workload({ rows, base }: { rows: WorkloadRow[]; base: string }) {
  const max = Math.max(1, ...rows.map((r) => r.pending + r.in_progress + r.in_review));
  if (!rows.length) return <p className="text-sm text-ink-500">Sin integrantes con tareas.</p>;
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const open = r.pending + r.in_progress + r.in_review;
        const level = open >= 10 ? "Alta" : open >= 5 ? "Media" : "Baja";
        return (
          <li key={r.id} className="flex items-center gap-3">
            <Avatar name={r.name} color={r.avatar_color} size={28} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <Link href={`${base}/tasks?assignee=${r.id}`} className="truncate font-medium hover:underline">{r.name}</Link>
                <span className="shrink-0 text-xs text-ink-500">
                  {open} abiertas{r.overdue > 0 && <span className="ml-1 font-medium text-rose-600">· {r.overdue} vencidas</span>}
                  <span className={`ml-2 chip ${level === "Alta" ? "bg-rose-50 text-rose-700" : level === "Media" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>Carga {level.toLowerCase()}</span>
                </span>
              </div>
              <div className="mt-1.5" style={{ width: `${Math.max(8, (open / max) * 100)}%` }}>
                <StackedBar total={open} segments={[
                  { label: "Pendiente", value: r.pending, color: STATUS_STYLE.pending.hex },
                  { label: "En progreso", value: r.in_progress, color: STATUS_STYLE.in_progress.hex },
                  { label: "En revisión", value: r.in_review, color: STATUS_STYLE.in_review.hex },
                ]} />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
