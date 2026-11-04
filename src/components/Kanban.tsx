"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import clsx from "clsx";
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, KeyboardSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { MessageSquare, Paperclip, ListChecks, GitBranch } from "lucide-react";
import { moveTask } from "@/actions/tasks";
import { STATUS_LABEL, STATUS_ORDER, STATUS_STYLE, type TaskStatus } from "@/lib/labels";
import type { TaskItem } from "@/lib/queries";
import { Avatar, DueDate, PriorityBadge } from "./ui";
import { QuickAddTask } from "./QuickAddTask";

type Props = {
  workspaceId: string;
  tasks: TaskItem[];
  linkBase: string; // URL con query actual, sin "task"
  canEdit: boolean;
  showProject?: boolean;
  quickAdd?: { projects: { id: string; name: string }[]; members: { id: string; name: string }[] };
};

export function KanbanBoard({ workspaceId, tasks: initial, linkBase, canEdit, showProject, quickAdd }: Props) {
  const [tasks, setTasks] = useState(initial);
  const [active, setActive] = useState<TaskItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  useEffect(() => setTasks(initial), [initial]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const byStatus = (s: TaskStatus) => tasks.filter((t) => t.status === s).sort((a, b) => a.position - b.position);

  function onDragStart(e: DragStartEvent) {
    setActive(tasks.find((t) => t.id === e.active.id) ?? null);
  }
  function onDragEnd(e: DragEndEvent) {
    setActive(null);
    const id = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId) return;
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    let status: TaskStatus;
    let beforeId: string | null = null;
    if (overId.startsWith("col:")) status = overId.slice(4) as TaskStatus;
    else {
      const over = tasks.find((t) => t.id === overId.replace("card:", ""));
      if (!over || over.id === id) return;
      status = over.status;
      beforeId = over.id;
    }
    if (status === task.status && !beforeId) return;
    // Actualización optimista
    const col = byStatus(status).filter((t) => t.id !== id);
    let pos: number;
    if (beforeId) {
      const i = col.findIndex((t) => t.id === beforeId);
      const prev = i > 0 ? col[i - 1].position : col[i].position - 2000;
      pos = (prev + col[i].position) / 2;
    } else pos = (col.at(-1)?.position ?? 0) + 1000;
    const snapshot = tasks;
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, status, position: pos } : t)));
    setError(null);
    start(async () => {
      const r = await moveTask(workspaceId, id, status, beforeId);
      if (r?.error) { setTasks(snapshot); setError(r.error); }
    });
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
      {error && <p role="alert" className="mb-3 rounded-lg bg-rose-50 p-2 text-sm text-rose-700">{error}</p>}
      <div className="-mx-3 flex snap-x gap-4 overflow-x-auto px-3 pb-4 sm:mx-0 sm:px-0">
        {STATUS_ORDER.map((s) => (
          <Column key={s} status={s} count={byStatus(s).length}>
            {byStatus(s).map((t) => <Card key={t.id} task={t} href={`${linkBase}task=${t.id}`} draggable={canEdit} showProject={showProject} />)}
            {quickAdd && canEdit && quickAdd.projects.length > 0 && (
              <QuickAddTask workspaceId={workspaceId} projects={quickAdd.projects} members={quickAdd.members} status={s} compact />
            )}
          </Column>
        ))}
      </div>
      <DragOverlay>{active && <CardBody task={active} showProject={showProject} dragging />}</DragOverlay>
    </DndContext>
  );
}

function Column({ status, count, children }: { status: TaskStatus; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}` });
  return (
    <div ref={setNodeRef} data-column={status}
      className={clsx("flex w-[280px] shrink-0 snap-start flex-col rounded-xl bg-ink-100/70 p-2 transition sm:w-[300px] xl:w-auto xl:min-w-[240px] xl:flex-1", isOver && "bg-brand-50 ring-2 ring-brand-200")}>
      <div className="flex items-center gap-2 px-2 pb-2 pt-1">
        <span className={clsx("h-2 w-2 rounded-full", STATUS_STYLE[status].dot)} />
        <span className="text-sm font-semibold text-ink-700">{STATUS_LABEL[status]}</span>
        <span className="ml-auto rounded-full bg-white px-2 text-xs font-medium text-ink-500">{count}</span>
      </div>
      <div className="flex min-h-[80px] flex-col gap-2">{children}</div>
    </div>
  );
}

function Card({ task, href, draggable, showProject }: { task: TaskItem; href: string; draggable: boolean; showProject?: boolean }) {
  const drag = useDraggable({ id: task.id, disabled: !draggable });
  const drop = useDroppable({ id: `card:${task.id}` });
  return (
    <div ref={(n) => { drag.setNodeRef(n); drop.setNodeRef(n); }} {...drag.listeners} {...drag.attributes}
      data-task-id={task.id}
      className={clsx("touch-manipulation", drag.isDragging && "opacity-30", drop.isOver && !drag.isDragging && "border-t-2 border-brand-500 pt-1")}>
      <Link href={href} scroll={false} draggable={false} className="block"><CardBody task={task} showProject={showProject} /></Link>
    </div>
  );
}

function CardBody({ task, showProject, dragging }: { task: TaskItem; showProject?: boolean; dragging?: boolean }) {
  return (
    <div className={clsx("rounded-lg bg-white p-3 shadow-card ring-1 ring-ink-200/70 transition hover:ring-brand-300", dragging && "rotate-2 shadow-lg")}>
      {showProject && <p className="mb-1 flex items-center gap-1.5 truncate text-[11px] text-ink-500"><span className="h-2 w-2 rounded-sm" style={{ background: task.project_color }} />{task.project_name}</p>}
      <p className={clsx("text-sm font-medium leading-snug text-ink-900", task.status === "done" && "text-ink-500 line-through")}>{task.title}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <PriorityBadge priority={task.priority} />
        <DueDate date={task.due_date} done={task.status === "done"} />
        <span className="ml-auto flex items-center gap-2 text-[11px] text-ink-400">
          {task.subtasks > 0 && <span className="flex items-center gap-0.5"><GitBranch className="h-3 w-3" />{task.subtasks_done}/{task.subtasks}</span>}
          {task.checklist > 0 && <span className="flex items-center gap-0.5"><ListChecks className="h-3 w-3" />{task.checklist_done}/{task.checklist}</span>}
          {task.comments > 0 && <span className="flex items-center gap-0.5"><MessageSquare className="h-3 w-3" />{task.comments}</span>}
          {task.attachments > 0 && <span className="flex items-center gap-0.5"><Paperclip className="h-3 w-3" />{task.attachments}</span>}
          <Avatar name={task.assignee_name} color={task.assignee_color} size={22} />
        </span>
      </div>
    </div>
  );
}
