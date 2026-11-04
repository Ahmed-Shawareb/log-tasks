"use client";
import { useEffect, useRef, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Clock, GripVertical, Hand, Inbox } from "lucide-react";
import { toast } from "sonner";
import { api, fmtDate, qs } from "@/lib/client";
import { cn, isOverdue, taskRef } from "@/lib/utils";
import type { TaskItem } from "@/lib/types";
import { useApp } from "./app-context";
import { Badge, PriorityBadge, Progress } from "./ui";
import { TypeIcon, qtyLabel, stepColor } from "./tasks/task-types";
import { stepsOf } from "./tasks/distribute-dialog";

const OPEN = "BACKLOG,READY,SCHEDULED,IN_PROGRESS,CHANGES_REQUESTED,BLOCKED,ON_HOLD";

/** What is dragged from the slider: a whole task, or one step of a staged task. */
export type Give = { task: TaskItem; stage: number | null };

/** Work that came to me (and, for admins, work nobody owns yet) that still has something to give out. */
export function useIncoming() {
  const { user, dataVersion } = useApp();
  const [items, setItems] = useState<TaskItem[] | null>(null);
  const isAdmin = user.role === "ADMIN";
  useEffect(() => {
    const load = async () => {
      const [mine, unowned] = await Promise.all([
        api<{ items: TaskItem[] }>(`/api/tasks${qs({ assigneeId: user.id, status: OPEN, pageSize: 100, sort: "due", plans: "1" })}`),
        isAdmin ? api<{ items: TaskItem[] }>(`/api/tasks${qs({ assigneeId: "none", status: OPEN, pageSize: 100, sort: "due", plans: "1" })}`) : Promise.resolve({ items: [] as TaskItem[] }),
      ]);
      setItems([...unowned.items, ...mine.items].filter((t) => t.remaining === null || t.remaining === undefined || t.remaining > 0));
    };
    load().catch((e) => toast.error(e instanceof Error ? e.message : "Could not load tasks"));
  }, [user.id, isAdmin, dataVersion]);
  return items;
}

function StepRow({ task, k, name }: { task: TaskItem; k: number; name: string }) {
  const left = task.stageRemaining?.[k] ?? 0;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `give|${task.id}|${k}`, data: { give: { task, stage: k } satisfies Give }, disabled: !left });
  const c = stepColor(name, k);
  const done = (task.quantity ?? 0) - left;
  return (
    <div ref={setNodeRef} {...attributes} {...listeners}
      className={cn("flex touch-manipulation select-none items-center gap-2 rounded-xl border border-line bg-panel px-2.5 py-2 transition", left ? "cursor-grab hover:-translate-y-px hover:border-line-strong hover:shadow-glow active:cursor-grabbing" : "opacity-50", isDragging && "opacity-30")}
      title={left ? `Drag onto a person's day to give out ${name.toLowerCase()}` : `${name}: everything given out`}>
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[10px] font-bold text-white" style={{ background: c }}>{k + 1}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="truncate font-semibold text-fg">{name}</span>
          <span className="shrink-0 tabular-nums text-muted">{left ? `${left} left` : "Done"}</span>
        </div>
        <Progress className="mt-1 h-1" value={task.quantity ? (done / task.quantity) * 100 : 0} color={c} />
      </div>
      {!!left && <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted" />}
    </div>
  );
}

/** The card for one incoming task. Staged tasks show one draggable row per step; other tasks drag as a whole. */
export function IncomingCard({ task, overlay, onOpen }: { task: TaskItem; overlay?: boolean; onOpen?: () => void }) {
  const steps = stepsOf(task);
  const whole = useDraggable({ id: `give|${task.id}|`, data: { give: { task, stage: null } satisfies Give }, disabled: overlay || steps.length > 0 });
  const color = task.type?.color ?? "#8b5cf6";
  const stepName = task.stage !== null && task.stage !== undefined ? task.type?.stages?.[task.stage] : null;
  const drag = !overlay && !steps.length ? { ref: whole.setNodeRef, ...whole.attributes, ...whole.listeners } : {};
  return (
    <div {...drag}
      className={cn("group relative shrink-0 snap-start overflow-hidden rounded-2xl border border-line p-4 transition-all",
        steps.length ? "w-80" : "w-64 cursor-grab touch-manipulation select-none active:cursor-grabbing hover:-translate-y-1 hover:shadow-glow",
        "bg-[color-mix(in_srgb,var(--panel-solid)_85%,transparent)]", whole.isDragging && "opacity-30", overlay && "rotate-2 scale-105 shadow-glow")}>
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-30 blur-2xl transition-opacity group-hover:opacity-60" style={{ background: color }} />
      <button type="button" onClick={onOpen} className="relative flex w-full items-center gap-2 text-left">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white" style={{ background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 55%, #000))` }}>
          <TypeIcon icon={task.type?.icon} className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="font-mono text-[10px] text-muted">{taskRef(task.number)}{task.project ? ` · ${task.project.client.name}` : ""}</div>
          <div className="truncate text-[11px] text-muted">{task.type?.name ?? "Task"}</div>
        </div>
        <span className="ml-auto"><PriorityBadge priority={task.priority} compact /></span>
      </button>
      <div className="relative mt-3 line-clamp-2 text-sm font-semibold leading-snug text-fg">{task.title}</div>
      <div className="relative mt-2 flex flex-wrap items-center gap-2">
        {stepName && <Badge color={stepColor(stepName, task.stage ?? 0)}>{stepName}</Badge>}
        {!steps.length && (task.remaining !== null && task.remaining !== undefined
          ? <Badge color={task.remaining ? "#f59e0b" : "#10b981"}>{task.remaining ? `${qtyLabel(task.type, task.remaining)} left` : "All given out"}</Badge>
          : <Badge color="#a78bfa">Single task</Badge>)}
        {task.dueAt && <span className={cn("inline-flex items-center gap-1 text-[11px]", isOverdue(task) ? "text-red-400" : "text-muted")}><Clock className="h-3 w-3" />{fmtDate(task.dueAt)}</span>}
      </div>
      {steps.length > 0 && (
        <div className="relative mt-3 space-y-1.5">
          {steps.map((s, k) => <StepRow key={s} task={task} k={k} name={s} />)}
        </div>
      )}
    </div>
  );
}

function Scroller({ children, label }: { children: React.ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const by = (d: number) => ref.current?.scrollBy({ left: d * 340, behavior: "smooth" });
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => by(-1)} aria-label="Scroll left" className="hidden h-8 w-8 shrink-0 place-items-center rounded-full border border-line-strong bg-panel-solid text-muted hover:text-fg md:grid"><ChevronLeft className="h-4 w-4" /></button>
      <div ref={ref} aria-label={label} className="flex min-w-0 flex-1 snap-x items-start gap-3 overflow-x-auto scroll-smooth py-1 [scrollbar-width:none]">{children}</div>
      <button onClick={() => by(1)} aria-label="Scroll right" className="hidden h-8 w-8 shrink-0 place-items-center rounded-full border border-line-strong bg-panel-solid text-muted hover:text-fg md:grid"><ChevronRight className="h-4 w-4" /></button>
    </div>
  );
}

/** Horizontal slider of incoming work. Must sit inside the page's DndContext; drops are handled by the page. */
export function IncomingStrip({ items }: { items: TaskItem[] | null }) {
  const { user, openTask } = useApp();
  const isAdmin = user.role === "ADMIN";
  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass gradient-border space-y-3 rounded-3xl p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Inbox className="h-4 w-4 text-accent-2" />
        <h2 className="text-sm font-semibold">{isAdmin ? "Tasks to send out" : "Tasks waiting for you to give out"}</h2>
        <Badge color="#a78bfa">{items?.length ?? 0}</Badge>
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted"><Hand className="h-3.5 w-3.5" /> Drag a step onto a person&apos;s day</span>
      </div>
      {items === null ? (
        <div className="flex gap-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-56 w-80 shrink-0 rounded-2xl" />)}</div>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line py-8 text-center text-xs text-muted">Nothing waiting. New tasks sent to you will appear here.</p>
      ) : (
        <Scroller label="Incoming tasks">
          <AnimatePresence initial={false}>
            {items.map((t) => (
              <motion.div key={t.id} layout initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.9 }}>
                <IncomingCard task={t} onOpen={() => openTask(t.id)} />
              </motion.div>
            ))}
          </AnimatePresence>
        </Scroller>
      )}
    </motion.section>
  );
}
