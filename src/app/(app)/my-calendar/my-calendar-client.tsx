"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DndContext, DragOverlay, pointerWithin, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { CalendarCheck, ChevronLeft, ChevronRight, Flag, GripVertical, Inbox, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { api, fmtDate, qs } from "@/lib/client";
import { cn, taskRef } from "@/lib/utils";
import type { TaskItem } from "@/lib/types";
import { useApp } from "@/components/app-context";
import { useDragSensors } from "@/components/drag-sensors";
import { FeedPanel } from "@/components/feed-panel";
import { Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Skeleton, StatusBadge } from "@/components/ui";

// An external's whole view of the system: their tasks on a month calendar. Drag a task onto the day you'll have
// it done — the founder sees that day. Social media tasks open their feed grid to fill in.

const OPEN = "BACKLOG,READY,SCHEDULED,IN_PROGRESS,CHANGES_REQUESTED,BLOCKED,ON_HOLD,SUBMITTED";
const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const sameDay = (a: Date, b: Date) => key(a) === key(b);
const steps = (t: TaskItem) => (t.stage === null && t.quantity !== null ? t.type?.stages ?? [] : []);
/** A counted task already split into parts: the parts are on the calendar, the task itself only shows what's left. */
const isSplit = (t: TaskItem) => t.quantity !== null && t._count.children > 0;
const leftOf = (t: TaskItem) => (t.quantity === null ? 0 : t.remaining ?? t.quantity);
/** What's still to plan, in words: "6 left" or, for a task with steps, "Script writing 6 · Filming 10 · Editing 10". */
export const leftLabel = (t: TaskItem) =>
  t.stageRemaining && t.type?.stages?.length ? t.type.stages.map((n, k) => `${n} ${t.stageRemaining![k]}`).join(" · ") + " left" : `${t.remaining ?? 0} left to plan`;

function TaskChip({ t, onOpen, onGrid, compact }: { t: TaskItem; onOpen: () => void; onGrid: () => void; compact?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: t.id, data: { t } });
  const late = !!(t.plannedAt && t.dueAt && new Date(t.plannedAt) > new Date(t.dueAt));
  const social = t.project?.kind === "SOCIAL_MEDIA";
  return (
    <div ref={setNodeRef} {...attributes} {...listeners}
      className={cn("group cursor-grab touch-manipulation select-none rounded-lg border px-2 py-1.5 text-left text-[11px] leading-tight transition active:cursor-grabbing",
        late ? "border-red-400/50 bg-red-500/10" : "border-line bg-panel hover:border-line-strong", isDragging && "opacity-30")}
      style={{ borderLeft: `3px solid ${t.project?.color ?? "var(--accent)"}` }}>
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="truncate font-medium text-fg">{t.title}</div>
        {!compact && <div className="truncate text-[10px] text-muted">{t.project?.client.name ?? taskRef(t.number)}</div>}
        {!compact && t.quantity !== null && t._count.children > 0 && <div className="text-[10px] font-semibold text-accent-2">{leftLabel(t)}</div>}
        {t.dueAt && <div className={cn("text-[10px]", late ? "text-red-400" : "text-muted")}><Flag className="mr-0.5 inline h-2.5 w-2.5" />due {fmtDate(t.dueAt)}{late ? " · planned after it" : ""}</div>}
      </button>
      {social && <button type="button" onClick={onGrid} className="mt-1 inline-flex items-center gap-1 rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent-2"><LayoutGrid className="h-3 w-3" /> Open the grid</button>}
    </div>
  );
}

function DayCell({ d, inMonth, today, children }: { d: Date; inMonth: boolean; today: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day|${key(d)}` });
  return (
    <div ref={setNodeRef} className={cn("flex min-h-[110px] flex-col gap-1 rounded-xl border p-1.5 transition", inMonth ? "border-line bg-panel/60" : "border-transparent opacity-40",
      today && "ring-2 ring-[var(--accent)]", isOver && "bg-accent-soft ring-2 ring-[var(--accent)]")}>
      <div className={cn("text-xs font-semibold", today ? "text-accent-2" : "text-fg-2")}>{d.getDate()}</div>
      {children}
    </div>
  );
}

function Unplanned({ children, count }: { children: React.ReactNode; count: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: "unplanned" });
  return (
    <Card className={cn("p-4 transition", isOver && "ring-2 ring-[var(--accent)]")}>
      <div ref={setNodeRef}>
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Inbox className="h-4 w-4 text-accent-2" /> To plan <span className="text-xs font-normal text-muted">{count}</span></div>
        <p className="mb-3 text-xs text-muted">Drag each task onto the day you&apos;ll have it done.</p>
        <div className="space-y-2">{children}</div>
      </div>
    </Card>
  );
}

export function MyCalendarClient() {
  const { user, openTask, dataVersion } = useApp();
  const sensors = useDragSensors();
  const [items, setItems] = useState<TaskItem[] | null>(null);
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const [drag, setDrag] = useState<TaskItem | null>(null);
  const [grid, setGrid] = useState<TaskItem | null>(null);
  const [part, setPart] = useState<{ t: TaskItem; day: string } | null>(null);

  const load = useCallback(() => {
    api<{ items: TaskItem[] }>(`/api/tasks${qs({ assigneeId: user.id, status: OPEN, pageSize: 200, sort: "due", plans: "1" })}`)
      .then((r) => setItems(r.items.filter((t) => !(isSplit(t) && leftOf(t) === 0)))) // fully split: only its parts show.catch((e) => toast.error(e instanceof Error ? e.message : "Could not load your tasks"));
  }, [user.id]);
  useEffect(() => { load(); }, [load, dataVersion]);

  const cells = useMemo(() => {
    const lead = month.getDay();
    const daysIn = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return Array.from({ length: Math.ceil((lead + daysIn) / 7) * 7 }, (_, k) => new Date(month.getFullYear(), month.getMonth(), k - lead + 1));
  }, [month]);
  const byDay = useMemo(() => {
    const m = new Map<string, TaskItem[]>();
    for (const t of items ?? []) if (t.plannedAt && !isSplit(t)) m.set(key(new Date(t.plannedAt)), [...(m.get(key(new Date(t.plannedAt))) ?? []), t]);
    return m;
  }, [items]);
  const deadlines = useMemo(() => new Set((items ?? []).filter((t) => t.dueAt).map((t) => key(new Date(t.dueAt!)))), [items]);
  const unplanned = (items ?? []).filter((t) => !t.plannedAt || isSplit(t));

  async function plan(t: TaskItem, day: string | null) {
    const at = day ? new Date(`${day}T17:00:00`) : null;
    setItems((xs) => xs?.map((x) => (x.id === t.id ? { ...x, plannedAt: at?.toISOString() ?? null } : x)) ?? null);
    try {
      const r = await api<{ afterDeadline: boolean }>(`/api/tasks/${t.id}/plan`, { body: { plannedAt: at?.toISOString() ?? null } });
      if (at) toast.success(`Planned for ${at.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}`, { description: r.afterDeadline ? "That's after the deadline — the founder will see it." : "The founder can see this date." });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not plan the task"); load(); }
  }

  function onDragEnd(e: DragEndEvent) {
    setDrag(null);
    const t = (e.active.data.current as { t: TaskItem } | undefined)?.t;
    if (!t || !e.over) return;
    const id = String(e.over.id);
    if (id === "unplanned") { if (t.plannedAt) plan(t, null); return; }
    const day = id.split("|")[1]!;
    // A number of things (e.g. 10 videos): ask whether all of it is done that day, or only part.
    if (t.quantity !== null && (leftOf(t) > 1 || steps(t).length > 0)) { setPart({ t, day }); return; }
    if (!t.plannedAt || key(new Date(t.plannedAt)) !== day) plan(t, day);
  }

  const today = new Date();
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Your work" title="My calendar" subtitle="Your tasks. Drag a task onto the day you'll finish it; open it to start, add files and submit." />
      {!items ? <Skeleton className="h-[520px] rounded-2xl" /> : items.length === 0 ? (
        <Card><EmptyState icon={<CalendarCheck className="h-6 w-6" />} title="Nothing to do right now" body="New tasks show up here as soon as they're given to you." /></Card>
      ) : (
        <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={(e) => setDrag((e.active.data.current as { t: TaskItem }).t)} onDragEnd={onDragEnd} onDragCancel={() => setDrag(null)}>
          <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
            <Card className="p-3 sm:p-4">
              <div className="mb-3 flex items-center justify-between">
                <Button size="icon" variant="ghost" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
                <div className="font-display text-2xl font-bold">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</div>
                <Button size="icon" variant="ghost" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
              </div>
              <div className="overflow-x-auto">
                <div className="min-w-[640px]">
                  <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wider text-muted">
                    {cells.slice(0, 7).map((d) => <div key={key(d)}>{d.toLocaleDateString(undefined, { weekday: "short" })}</div>)}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {cells.map((d) => (
                      <DayCell key={key(d)} d={d} inMonth={d.getMonth() === month.getMonth()} today={sameDay(d, today)}>
                        {deadlines.has(key(d)) && <div className="flex items-center gap-1 text-[10px] text-red-400"><Flag className="h-2.5 w-2.5" /> deadline</div>}
                        {(byDay.get(key(d)) ?? []).map((t) => <TaskChip key={t.id} t={t} compact onOpen={() => openTask(t.id)} onGrid={() => setGrid(t)} />)}
                      </DayCell>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
            <div className="space-y-4">
              <Unplanned count={unplanned.length}>
                {unplanned.length === 0 ? <p className="text-xs text-muted">Everything has a day. Drag a task back here to unplan it.</p>
                  : unplanned.map((t) => <TaskChip key={t.id} t={t} onOpen={() => openTask(t.id)} onGrid={() => setGrid(t)} />)}
              </Unplanned>
              <Card className="p-4">
                <div className="mb-2 text-sm font-semibold">All my tasks</div>
                <ul className="space-y-2">
                  {items.map((t) => (
                    <li key={t.id}>
                      <button type="button" onClick={() => openTask(t.id)} className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-xs hover:bg-panel-hover">
                        <span className="min-w-0 flex-1 truncate text-fg">{t.title}</span>
                        <StatusBadge status={t.status} />
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>
          <DragOverlay dropAnimation={{ duration: 160 }}>
            {drag && <div className="w-48 rotate-2 rounded-lg border border-line bg-panel-solid px-2 py-1.5 text-[11px] shadow-glow"><GripVertical className="mr-1 inline h-3 w-3 text-muted" />{drag.title}</div>}
          </DragOverlay>
        </DndContext>
      )}
      <PartDialog part={part} userId={user.id} onClose={() => setPart(null)} onDone={() => { setPart(null); load(); }} planWhole={(t, day) => { setPart(null); plan(t, day); }} />
      <Modal open={!!grid} onClose={() => setGrid(null)} size="xl" title={grid?.project?.name ?? "Grid"} subtitle={grid?.title}>
        {grid?.project && <FeedPanel projectId={grid.project.id} projectName={grid.project.name} postCount={null} />}
      </Modal>
    </div>
  );
}

/** "All of it, or part?" — planning a counted task on a day. Part splits it into a piece for that day. */
function PartDialog({ part, userId, onClose, onDone, planWhole }: {
  part: { t: TaskItem; day: string } | null; userId: string; onClose: () => void; onDone: () => void; planWhole: (t: TaskItem, day: string) => void;
}) {
  const t = part?.t;
  const st = t ? steps(t) : [];
  const [stage, setStage] = useState(0);
  const left = !t ? 0 : st.length ? t.stageRemaining?.[stage] ?? t.quantity ?? 0 : leftOf(t);
  const [n, setN] = useState(1);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (t) { setStage(0); setN(st.length ? t.stageRemaining?.[0] ?? t.quantity ?? 1 : leftOf(t)); } }, [t]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!t || !part) return null;
  const unit = (k: number) => (k === 1 ? t.type?.unit : t.type?.unitPlural) ?? (k === 1 ? "item" : "items");
  const dayLabel = new Date(`${part.day}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const confirm = async (qty: number) => {
    // The whole task, never split before: just put it on the day.
    if (!st.length && qty === t.quantity && !t._count.children) return planWhole(t, part.day);
    setBusy(true);
    try {
      await api(`/api/tasks/${t.id}/distribute`, { body: { allocations: [{ assigneeId: userId, quantity: qty, ...(st.length ? { stage } : {}), plannedAt: new Date(`${part.day}T17:00:00`).toISOString() }] } });
      toast.success(`${qty} ${unit(qty)} planned for ${dayLabel}`, { description: qty < left ? `${left - qty} left to plan.` : "All of it is planned." });
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not plan it"); }
    finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} size="sm" title={`Plan for ${dayLabel}`} subtitle={t.title}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button disabled={busy || !left} onClick={() => confirm(left)}>All {left}</Button>
        <Button variant="primary" loading={busy} disabled={!left || n < 1 || n > left} onClick={() => confirm(n)}>Plan {n}</Button>
      </>}>
      <div className="space-y-4">
        {st.length > 0 && (
          <Field label="Which step?">
            <Select value={stage} onChange={(e) => { const k = Number(e.target.value); setStage(k); setN(t.stageRemaining?.[k] ?? t.quantity ?? 1); }}>
              {st.map((name, k) => <option key={name} value={k}>{name} · {t.stageRemaining?.[k] ?? t.quantity} left</option>)}
            </Select>
          </Field>
        )}
        <Field label={`How many ${unit(2)} will you finish that day?`} hint={`${left} ${unit(left)} left to plan. The rest stays in “To plan”.`}>
          <div className="flex items-center gap-2">
            <Button type="button" size="icon" onClick={() => setN((x) => Math.max(1, x - 1))} aria-label="Fewer">−</Button>
            <Input type="number" min={1} max={left} value={n} onChange={(e) => setN(Math.max(1, Math.min(left, Number(e.target.value) || 1)))} className="w-24 text-center font-display text-xl font-bold" aria-label="How many" />
            <Button type="button" size="icon" onClick={() => setN((x) => Math.min(left, x + 1))} aria-label="More">+</Button>
            <span className="text-sm text-muted">of {left}</span>
          </div>
        </Field>
      </div>
    </Modal>
  );
}

