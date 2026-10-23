"use client";
import { useEffect, useMemo, useState } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { AnimatePresence, motion } from "motion/react";
import { Columns3, Eye, EyeOff, Plus, Rows3 } from "lucide-react";
import { toast } from "sonner";
import { PRIORITY_META, STATUS_META, type PriorityKey, type StatusKey } from "@/lib/constants";
import { dropIntent } from "@/lib/workflow";
import { api, qs } from "@/lib/client";
import { cn, taskRef } from "@/lib/utils";
import type { TaskItem } from "@/lib/types";
import { useApp } from "@/components/app-context";
import { FilterBar, type Filters } from "@/components/tasks/filter-bar";
import { useEligible } from "@/components/tasks/pickers";
import { TaskCard } from "@/components/tasks/task-card";
import { ConflictDialog, isConflict, ReasonDialog, ReviewDialog, SubmitDialog, type ConflictState } from "@/components/tasks/dialogs";
import { Avatar, Button, PageHeader, Segmented, Skeleton } from "@/components/ui";

const DEFAULT_COLUMNS: StatusKey[] = ["BACKLOG", "READY", "SCHEDULED", "IN_PROGRESS", "BLOCKED", "SUBMITTED", "CHANGES_REQUESTED", "APPROVED"];

function sortTasks(a: TaskItem, b: TaskItem) {
  const p = PRIORITY_META[b.priority as PriorityKey].weight - PRIORITY_META[a.priority as PriorityKey].weight;
  if (p) return p;
  return (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) - (b.dueAt ? new Date(b.dueAt).getTime() : Infinity);
}

function DraggableCard({ task, onOpen }: { task: TaskItem; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, data: { task } });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn("touch-none", isDragging && "opacity-30")}>
      <TaskCard task={task} onClick={onOpen} />
    </div>
  );
}

function Column({ id, status, tasks, onOpen, label, compact }: { id: string; status: StatusKey; tasks: TaskItem[]; onOpen: (t: TaskItem) => void; label?: React.ReactNode; compact?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { status } });
  const meta = STATUS_META[status];
  return (
    <div ref={setNodeRef} className={cn("flex w-[290px] shrink-0 flex-col rounded-2xl border border-line bg-[color-mix(in_srgb,var(--panel)_70%,transparent)] backdrop-blur-xl transition-all duration-200", isOver && "scale-[1.01] border-accent shadow-glow")}>
      {!compact && (
        <div className="flex items-center gap-2 px-3 pb-2 pt-3">
          <span className="h-2.5 w-2.5 rounded-full shadow-[0_0_10px_currentColor]" style={{ background: meta.color, color: meta.color }} />
          <span className="text-xs font-semibold uppercase tracking-wider text-fg-2">{label ?? meta.label}</span>
          <span className="ml-auto rounded-full bg-[var(--line)] px-2 text-[11px] text-muted">{tasks.length}</span>
        </div>
      )}
      <div className={cn("flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto p-2", compact ? "max-h-[420px]" : "max-h-[calc(100dvh-300px)]")}>
        <AnimatePresence initial={false}>
          {tasks.map((t) => (
            <motion.div key={t.id} layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ type: "spring", stiffness: 500, damping: 38 }}>
              <DraggableCard task={t} onOpen={() => onOpen(t)} />
            </motion.div>
          ))}
        </AnimatePresence>
        {tasks.length === 0 && <div className={cn("grid flex-1 place-items-center rounded-xl border border-dashed border-line py-6 text-[11px] text-muted transition", isOver && "border-accent text-accent-2")}>Drop here</div>}
      </div>
    </div>
  );
}

export function BoardClient() {
  const { user, isManager, openTask, openCreate, dataVersion, invalidate } = useApp();
  const [filters, setFilters] = useState<Filters>(isManager ? {} : { mine: "1" });
  const [tasks, setTasks] = useState<TaskItem[] | null>(null);
  const [lanes, setLanes] = useState<"none" | "assignee">("none");
  const [showCancelled, setShowCancelled] = useState(false);
  const [active, setActive] = useState<TaskItem | null>(null);
  const [submitTask, setSubmitTask] = useState<TaskItem | null>(null);
  const [review, setReview] = useState<{ task: TaskItem; decision: "APPROVED" | "CHANGES_REQUESTED" } | null>(null);
  const [reason, setReason] = useState<{ task: TaskItem; to: StatusKey } | null>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api<{ items: TaskItem[] }>(`/api/tasks${qs({ ...filters, pageSize: 500, sort: "priority" })}`, { signal: ctrl.signal })
        .then((r) => setTasks(r.items)).catch((e) => e.name !== "AbortError" && toast.error(e.message));
    }, 150);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [filters, dataVersion]);

  const columns = showCancelled ? [...DEFAULT_COLUMNS, "ON_HOLD", "CANCELLED"] as StatusKey[] : [...DEFAULT_COLUMNS, "ON_HOLD"] as StatusKey[];
  const byStatus = useMemo(() => {
    const m = new Map<string, TaskItem[]>();
    for (const t of tasks ?? []) m.set(t.status, [...(m.get(t.status) ?? []), t]);
    for (const [, v] of m) v.sort(sortTasks);
    return m;
  }, [tasks]);
  const { people: eligible } = useEligible(isManager ? filters.department || null : null);
  const people = useMemo(() => {
    const m = new Map<string, { id: string; name: string; avatarColor: string }>();
    for (const p of eligible) if (!filters.assigneeId || p.id === filters.assigneeId) m.set(p.id, p);
    for (const t of tasks ?? []) if (t.assignee) m.set(t.assignee.id, t.assignee);
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks, eligible, filters.assigneeId]);

  const patchLocal = (id: string, patch: Partial<TaskItem>) => setTasks((ts) => ts?.map((t) => (t.id === id ? { ...t, ...patch } : t)) ?? ts);

  async function moveStatus(task: TaskItem, to: StatusKey, why?: string) {
    const before = task.status;
    patchLocal(task.id, { status: to }); // optimistic
    try {
      const updated = await api<TaskItem>(`/api/tasks/${task.id}/status`, { body: { status: to, version: task.version, reason: why } });
      patchLocal(task.id, updated);
      toast.success(`${taskRef(task.number)} → ${STATUS_META[to].label}`);
    } catch (e) {
      patchLocal(task.id, { status: before }); // roll back
      toast.error(e instanceof Error ? e.message : "Could not move task");
    }
  }

  async function reassign(task: TaskItem, toId: string | null, onConflict?: "unschedule") {
    const before = task.assignee;
    const target = people.find((p) => p.id === toId) ?? null;
    patchLocal(task.id, { assigneeId: toId, assignee: target ? { ...target, email: "", role: "EMPLOYEE" } : null } as Partial<TaskItem>);
    try {
      await api(`/api/tasks/${task.id}`, { method: "PATCH", body: { assigneeId: toId, version: task.version, onConflict, handoffNote: "Moved on the board" } });
      toast.success(`${taskRef(task.number)} handed to ${target?.name ?? "nobody"}`);
      invalidate();
    } catch (e) {
      patchLocal(task.id, { assigneeId: before?.id ?? null, assignee: before } as Partial<TaskItem>);
      if (isConflict(e)) setConflict({ message: e.message, details: e.details, onUnschedule: () => reassign(task, toId, "unschedule") });
      else toast.error(e instanceof Error ? e.message : "Could not reassign");
    }
  }

  function onDragEnd(e: DragEndEvent) {
    setActive(null);
    const task = e.active.data.current?.task as TaskItem | undefined;
    if (!task || !e.over) return;
    const [statusPart, lanePart] = String(e.over.id).split("|");
    const to = statusPart as StatusKey;
    // Lane change = hand-off (keeps status).
    if (lanes === "assignee" && lanePart !== undefined) {
      const laneUser = lanePart === "none" ? null : lanePart;
      if (laneUser !== task.assigneeId) {
        if (to !== task.status) return toast.info("Move between people or between columns — one change at a time.");
        return reassign(task, laneUser);
      }
    }
    if (to === task.status) return;
    const isAssignee = task.assigneeId === user.id;
    const canManage = isManager; // the server makes the final decision
    const intent = dropIntent(task.status as StatusKey, to, { canManage, isAssignee, canReview: isManager && !isAssignee });
    if (intent.kind === "denied") return toast.error(intent.reason);
    if (intent.kind === "submit") return setSubmitTask(task);
    if (intent.kind === "review") return setReview({ task, decision: intent.decision });
    if (to === "BLOCKED" || to === "CANCELLED") return setReason({ task, to });
    moveStatus(task, to);
  }

  const mini = (t: TaskItem | null) => t && { id: t.id, number: t.number, title: t.title, version: t.version, assigneeId: t.assigneeId, department: t.department, scheduledStart: t.scheduledStart };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Work" title={isManager ? "Board" : "My board"} subtitle="Drag cards between columns to update status. Every move is checked and saved immediately."
        actions={<>
          {isManager && <Segmented options={[{ key: "none", label: <span className="flex items-center gap-1"><Columns3 className="h-3.5 w-3.5" /> Columns</span> }, { key: "assignee", label: <span className="flex items-center gap-1"><Rows3 className="h-3.5 w-3.5" /> By person</span> }]} value={lanes} onChange={setLanes} />}
          <Button size="sm" variant="ghost" onClick={() => setShowCancelled((s) => !s)}>{showCancelled ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} Cancelled</Button>
          {isManager && <Button size="sm" variant="primary" onClick={() => openCreate()}><Plus className="h-4 w-4" /> New task</Button>}
        </>} />
      <FilterBar value={filters} onChange={setFilters} hide={["status", "archived"]} />
      {lanes === "assignee" && <p className="text-xs text-muted">Tip: drag a card into another person’s row to hand it off. Their working hours, leave and bookings are checked first.</p>}

      {!tasks ? (
        <div className="flex gap-4 overflow-hidden">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-96 w-[290px] shrink-0 rounded-2xl" />)}</div>
      ) : (
        <DndContext sensors={sensors} onDragStart={(e: DragStartEvent) => setActive(e.active.data.current?.task ?? null)} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
          {lanes === "none" ? (
            <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
              {columns.map((s) => <Column key={s} id={s} status={s} tasks={byStatus.get(s) ?? []} onOpen={(t) => openTask(t.id)} />)}
            </div>
          ) : (
            <div className="-mx-4 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
              <div className="inline-flex min-w-full flex-col gap-4">
                <div className="sticky top-0 flex gap-4 pl-[180px]">
                  {columns.map((s) => <div key={s} className="flex w-[290px] shrink-0 items-center gap-2 px-3 text-xs font-semibold uppercase tracking-wider text-fg-2"><span className="h-2 w-2 rounded-full" style={{ background: STATUS_META[s].color }} />{STATUS_META[s].label}</div>)}
                </div>
                {[...people, { id: "none", name: "Unassigned", avatarColor: "#475569" }].map((p) => (
                  <div key={p.id} className="flex gap-4">
                    <div className="glass sticky left-0 z-10 flex w-[164px] shrink-0 flex-col items-start gap-2 rounded-2xl p-3">
                      <Avatar name={p.name} color={p.avatarColor} size={32} />
                      <span className="text-sm font-medium leading-tight text-fg">{p.name}</span>
                      <span className="text-[11px] text-muted">{(tasks ?? []).filter((t) => (t.assigneeId ?? "none") === p.id).length} tasks</span>
                    </div>
                    {columns.map((s) => (
                      <Column key={s} compact id={`${s}|${p.id}`} status={s} onOpen={(t) => openTask(t.id)}
                        tasks={(byStatus.get(s) ?? []).filter((t) => (t.assigneeId ?? "none") === p.id)} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
          <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(.22,1,.36,1)" }}>
            {active && <div className="w-[274px]"><TaskCard task={active} dragging /></div>}
          </DragOverlay>
        </DndContext>
      )}

      <SubmitDialog task={mini(submitTask)} open={!!submitTask} onClose={() => setSubmitTask(null)} onDone={invalidate} />
      <ReviewDialog task={mini(review?.task ?? null)} open={!!review} initial={review?.decision} onClose={() => setReview(null)} onDone={invalidate} />
      <ReasonDialog open={!!reason} title={reason ? `Mark ${taskRef(reason.task.number)} as ${STATUS_META[reason.to].label}` : ""} onClose={() => setReason(null)} onSubmit={async (r) => { if (reason) await moveStatus(reason.task, reason.to, r); }} />
      <ConflictDialog state={conflict} onClose={() => setConflict(null)} />
    </div>
  );
}
