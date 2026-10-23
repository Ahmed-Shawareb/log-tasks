"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight, Flag, Inbox, Plane, UserRoundPlus } from "lucide-react";
import { toast } from "sonner";
import { DEPARTMENTS, PRIORITY_META, STATUS_META, type PriorityKey, type StatusKey } from "@/lib/constants";
import { api, fmtTime, qs } from "@/lib/client";
import { cn, formatMinutes, isOverdue, taskRef } from "@/lib/utils";
import type { TaskItem } from "@/lib/types";
import { useApp } from "@/components/app-context";
import { ConflictDialog, isConflict, type ConflictState } from "@/components/tasks/dialogs";
import { useProjects } from "@/components/tasks/pickers";
import { Avatar, Badge, Button, Card, PageHeader, Progress, Segmented, Select, Skeleton } from "@/components/ui";

type Person = { id: string; name: string; avatarColor: string; title: string | null; role: string; workDays: number[]; workStartMin: number; workEndMin: number; weeklyCapacityMin: number; department: { key: string; name: string; color: string } | null };
type Board = { start: string; days: number; people: Person[]; tasks: TaskItem[]; leaves: { id: string; userId: string; startsAt: string; endsAt: string; type: string; note: string | null }[]; unassigned: TaskItem[]; openCounts: Record<string, number> };

const DAY_MS = 86_400_000;
const isoDow = (d: Date) => ((d.getDay() + 6) % 7) + 1;
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

function Chip({ task, kind, onOpen }: { task: TaskItem; kind: "block" | "deadline" | "floating"; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `${kind}:${task.id}`, data: { task, kind } });
  const s = STATUS_META[task.status as StatusKey];
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} onClick={onOpen}
      className={cn("group cursor-grab touch-none rounded-lg border px-2 py-1 text-[11px] leading-tight transition hover:-translate-y-px hover:shadow-glow active:cursor-grabbing", isDragging && "opacity-30",
        kind === "deadline" ? "border-dashed border-red-400/60 bg-red-500/5" : "border-transparent")}
      style={kind !== "deadline" ? { background: `color-mix(in srgb, ${s.color} 26%, var(--panel-solid))`, borderLeft: `3px solid ${PRIORITY_META[task.priority as PriorityKey].color}` } : undefined}
      title={`${taskRef(task.number)} · ${task.title} · ${s.label}`}>
      <div className="flex items-center gap-1 text-[10px] text-muted">
        {kind === "deadline" ? <Flag className="h-2.5 w-2.5 text-red-400" /> : null}
        <span className="font-mono">{taskRef(task.number)}</span>
        {kind === "block" && task.scheduledStart && <span>· {fmtTime(task.scheduledStart)}</span>}
        {kind === "deadline" && task.dueAt && <span>· due {fmtTime(task.dueAt)}</span>}
      </div>
      <div className={cn("truncate font-medium text-fg", isOverdue(task) && "text-red-300")}>{task.title}</div>
    </div>
  );
}

function Cell({ id, children, off, leave, load, cap, today }: { id: string; children: React.ReactNode; off: boolean; leave?: string; load: number; cap: number; today: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const pctv = cap ? (load / cap) * 100 : 0;
  return (
    <div ref={setNodeRef} className={cn("relative flex min-h-[112px] flex-col gap-1 border-l border-line p-1.5 transition-colors", off && "bg-[repeating-linear-gradient(135deg,transparent,transparent_8px,var(--line)_8px,var(--line)_9px)]", today && "bg-accent-soft/30", isOver && "bg-accent-soft ring-2 ring-inset ring-[var(--accent)]")}>
      {leave && <div className="flex items-center gap-1 rounded-md bg-[var(--line)] px-1.5 py-0.5 text-[10px] text-muted"><Plane className="h-3 w-3" /> {leave}</div>}
      <div className="flex flex-1 flex-col gap-1">{children}</div>
      {!off && cap > 0 && (
        <div className="mt-auto flex items-center gap-1.5 pt-1" title={`${formatMinutes(load)} booked of ${formatMinutes(cap)}`}>
          <Progress value={pctv} color={pctv > 100 ? "#ef4444" : pctv > 85 ? "#f59e0b" : "linear-gradient(90deg,#8b5cf6,#22d3ee)"} className="h-1" />
          <span className={cn("w-8 text-right text-[9px] tabular-nums", pctv > 100 ? "text-red-400" : "text-muted")}>{Math.round(pctv)}%</span>
        </div>
      )}
    </div>
  );
}

function PersonHeader({ p, open, booked }: { p: Person; open: number; booked: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `person|${p.id}` });
  const cap = p.weeklyCapacityMin;
  return (
    <div ref={setNodeRef} className={cn("sticky left-0 z-10 flex w-52 shrink-0 items-center gap-3 border-r border-line bg-[color-mix(in_srgb,var(--panel-solid)_92%,transparent)] p-3 backdrop-blur transition", isOver && "bg-accent-soft ring-2 ring-inset ring-[var(--accent)]")}
      title="Drop here to hand the task to this person without changing its schedule">
      <Avatar name={p.name} color={p.avatarColor} size={34} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-fg">{p.name}</div>
        <div className="truncate text-[10px] text-muted">{p.title ?? p.department?.name}</div>
        <div className="mt-1 flex items-center gap-1.5"><Progress value={cap ? (booked / cap) * 100 : 0} className="h-1" color={booked > cap ? "#ef4444" : undefined} /><span className="shrink-0 text-[9px] text-muted">{open} open</span></div>
      </div>
    </div>
  );
}

export function TeamClient() {
  const { openTask, dataVersion, invalidate, user } = useApp();
  const projects = useProjects();
  const [days, setDays] = useState<"7" | "14">("7");
  const [start, setStart] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); return d; });
  const [department, setDepartment] = useState(user.departmentKey && ["PERFORMANCE", "PRODUCTION"].includes(user.departmentKey) ? user.departmentKey : "");
  const [teamId, setTeamId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [board, setBoard] = useState<Board | null>(null);
  const [drag, setDrag] = useState<{ task: TaskItem; kind: string } | null>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => { api<{ id: string; name: string }[]>("/api/teams").then(setTeams).catch(() => {}); }, []);
  const load = useCallback(() => {
    api<Board>(`/api/workload${qs({ start: start.toISOString(), days, department, teamId, projectId })}`).then(setBoard).catch((e) => toast.error(e.message));
  }, [start, days, department, teamId, projectId]);
  useEffect(() => { load(); }, [load, dataVersion]);

  const dayList = useMemo(() => Array.from({ length: Number(days) }, (_, i) => new Date(start.getTime() + i * DAY_MS)), [start, days]);

  const cellData = useMemo(() => {
    const m = new Map<string, { blocks: TaskItem[]; deadlines: TaskItem[]; load: number }>();
    for (const t of board?.tasks ?? []) {
      if (!t.assigneeId) continue;
      dayList.forEach((d, i) => {
        const key = `${t.assigneeId}|${i}`;
        const c = m.get(key) ?? { blocks: [], deadlines: [], load: 0 };
        if (t.scheduledStart && sameDay(new Date(t.scheduledStart), d)) {
          c.blocks.push(t);
          c.load += (new Date(t.scheduledEnd!).getTime() - new Date(t.scheduledStart).getTime()) / 60_000;
        } else if (t.dueAt && sameDay(new Date(t.dueAt), d) && !["APPROVED", "CANCELLED"].includes(t.status)) c.deadlines.push(t);
        m.set(key, c);
      });
    }
    for (const c of m.values()) c.blocks.sort((a, b) => +new Date(a.scheduledStart!) - +new Date(b.scheduledStart!));
    return m;
  }, [board, dayList]);

  const floating = useMemo(() => {
    const m = new Map<string, TaskItem[]>();
    for (const t of board?.tasks ?? []) if (t.assigneeId && !t.scheduledStart && !t.dueAt && !["APPROVED", "CANCELLED"].includes(t.status)) m.set(t.assigneeId, [...(m.get(t.assigneeId) ?? []), t]);
    return m;
  }, [board]);

  async function place(task: TaskItem, personId: string, day: Date, kind: string) {
    const person = board!.people.find((p) => p.id === personId)!;
    const prevStart = task.scheduledStart ? new Date(task.scheduledStart) : null;
    const duration = task.scheduledStart && task.scheduledEnd ? new Date(task.scheduledEnd).getTime() - new Date(task.scheduledStart).getTime() : (task.estimateMinutes || 120) * 60_000;
    const s = new Date(day);
    if (prevStart && kind === "block") s.setHours(prevStart.getHours(), prevStart.getMinutes(), 0, 0);
    else s.setHours(Math.floor(person.workStartMin / 60), person.workStartMin % 60, 0, 0);
    const e = new Date(s.getTime() + duration);
    try {
      await api(`/api/tasks/${task.id}/schedule`, { body: { start: s.toISOString(), end: e.toISOString(), assigneeId: personId !== task.assigneeId ? personId : undefined, version: task.version } });
      toast.success(personId !== task.assigneeId ? `${taskRef(task.number)} handed to ${person.name}` : `${taskRef(task.number)} moved`, { description: `${s.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} ${fmtTime(s)}–${fmtTime(e)}` });
      invalidate();
    } catch (err) {
      if (isConflict(err)) setConflict({ message: err.message, details: err.details, onPick: (slot) => schedulePick(task, personId, slot) });
      else toast.error(err instanceof Error ? err.message : "Could not move task");
    }
  }
  async function schedulePick(task: TaskItem, personId: string, slot: { start: string; end: string }) {
    try {
      await api(`/api/tasks/${task.id}/schedule`, { body: { ...slot, assigneeId: personId !== task.assigneeId ? personId : undefined } });
      toast.success("Booked in the suggested slot");
      invalidate();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not schedule"); }
  }
  async function handTo(task: TaskItem, personId: string, onConflict?: "unschedule") {
    if (personId === task.assigneeId) return;
    try {
      const r = await api<{ freedSlot?: boolean }>(`/api/tasks/${task.id}`, { method: "PATCH", body: { assigneeId: personId, version: task.version, onConflict, handoffNote: "Moved on the team schedule" } });
      toast.success(`${taskRef(task.number)} handed off`, { description: r.freedSlot ? "Booked slot cleared — the new owner is busy then." : undefined });
      invalidate();
    } catch (e) {
      if (isConflict(e)) setConflict({ message: e.message, details: e.details, onUnschedule: () => handTo(task, personId, "unschedule") });
      else toast.error(e instanceof Error ? e.message : "Could not hand off");
    }
  }

  function onDragEnd(e: DragEndEvent) {
    setDrag(null);
    const data = e.active.data.current as { task: TaskItem; kind: string } | undefined;
    if (!data || !e.over) return;
    const [a, b] = String(e.over.id).split("|");
    if (a === "person") return handTo(data.task, b!);
    const dayIdx = Number(b);
    place(data.task, a!, dayList[dayIdx]!, data.kind);
  }

  const shift = (n: number) => setStart((d) => new Date(d.getTime() + n * Number(days) * DAY_MS));
  const today = new Date();

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Plan" title="Team schedule" subtitle="One lane per person. Drag work between days or people. Availability, leave and dependencies are checked on the server before anything moves."
        actions={<Segmented options={[{ key: "7", label: "1 week" }, { key: "14", label: "2 weeks" }]} value={days} onChange={setDays} />} />

      <div className="glass flex flex-wrap items-center gap-2 rounded-2xl p-2">
        <Button size="icon" variant="ghost" onClick={() => shift(-1)} aria-label="Previous"><ChevronLeft className="h-4 w-4" /></Button>
        <Button size="sm" onClick={() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); setStart(d); }}>This week</Button>
        <Button size="icon" variant="ghost" onClick={() => shift(1)} aria-label="Next"><ChevronRight className="h-4 w-4" /></Button>
        <span className="ml-2 font-display text-lg font-bold">{dayList[0]!.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – {dayList[dayList.length - 1]!.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Select className="h-9 w-auto" value={department} onChange={(e) => setDepartment(e.target.value)} aria-label="Department"><option value="">All departments</option>{DEPARTMENTS.filter((d) => d.key !== "MANAGEMENT").map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}</Select>
          <Select className="h-9 w-auto" value={teamId} onChange={(e) => setTeamId(e.target.value)} aria-label="Team"><option value="">All teams</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
          <Select className="h-9 w-auto" value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Project"><option value="">All projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        </div>
      </div>

      {!board ? <Skeleton className="h-[480px] w-full rounded-2xl" /> : (
        <DndContext sensors={sensors} onDragStart={(e) => setDrag(e.active.data.current as { task: TaskItem; kind: string })} onDragEnd={onDragEnd} onDragCancel={() => setDrag(null)}>
          <div className="grid gap-4 2xl:grid-cols-[1fr_280px]">
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <div className="min-w-max">
                  <div className="flex border-b border-line">
                    <div className="sticky left-0 z-10 w-52 shrink-0 border-r border-line bg-[color-mix(in_srgb,var(--panel-solid)_92%,transparent)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{board.people.length} people</div>
                    {dayList.map((d) => (
                      <div key={d.toISOString()} className={cn("w-40 shrink-0 border-l border-line px-2 py-2 text-center", sameDay(d, today) && "bg-accent-soft/40")}>
                        <div className="text-[10px] uppercase tracking-wider text-muted">{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
                        <div className={cn("font-display text-lg font-bold", sameDay(d, today) ? "text-accent-2" : "text-fg")}>{d.getDate()}</div>
                      </div>
                    ))}
                  </div>
                  {board.people.map((p, row) => {
                    const open = board.openCounts?.[p.id] ?? 0;
                    const booked = dayList.reduce((s, _d, i) => s + (cellData.get(`${p.id}|${i}`)?.load ?? 0), 0);
                    return (
                      <motion.div key={p.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: row * 0.03 }} className="flex border-b border-line last:border-b-0">
                        <PersonHeader p={p} open={open} booked={booked} />
                        {dayList.map((d, i) => {
                          const c = cellData.get(`${p.id}|${i}`);
                          const off = !p.workDays.includes(isoDow(d));
                          const lv = board.leaves.find((l) => l.userId === p.id && new Date(l.startsAt) < new Date(d.getTime() + DAY_MS) && new Date(l.endsAt) > d);
                          const cap = off ? 0 : p.workEndMin - p.workStartMin;
                          return (
                            <div key={i} className="w-40 shrink-0">
                              <Cell id={`${p.id}|${i}`} off={off} leave={lv ? lv.type.toLowerCase() : undefined} load={c?.load ?? 0} cap={cap} today={sameDay(d, today)}>
                                {c?.blocks.map((t) => <Chip key={t.id} task={t} kind="block" onOpen={() => openTask(t.id)} />)}
                                {c?.deadlines.map((t) => <Chip key={t.id} task={t} kind="deadline" onOpen={() => openTask(t.id)} />)}
                              </Cell>
                            </div>
                          );
                        })}
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </Card>

            <aside className="space-y-4">
              <Card>
                <div className="flex items-center gap-2 border-b border-line px-4 py-3"><UserRoundPlus className="h-4 w-4 text-accent-2" /><span className="text-sm font-semibold">Unassigned</span><Badge className="ml-auto" color="#a78bfa">{board.unassigned.length}</Badge></div>
                <p className="px-4 pt-3 text-[11px] text-muted">Drop on a person’s day to assign and book, or on their name to assign only.</p>
                <div className="max-h-[360px] space-y-1.5 overflow-y-auto p-3">
                  {board.unassigned.map((t) => <Chip key={t.id} task={t} kind="floating" onOpen={() => openTask(t.id)} />)}
                  {board.unassigned.length === 0 && <p className="py-4 text-center text-xs text-muted">Nothing waiting for an owner.</p>}
                </div>
              </Card>
              <Card>
                <div className="flex items-center gap-2 border-b border-line px-4 py-3"><Inbox className="h-4 w-4 text-accent-2" /><span className="text-sm font-semibold">Assigned, no date</span></div>
                <div className="max-h-[360px] space-y-3 overflow-y-auto p-3">
                  {[...floating.entries()].map(([pid, ts]) => {
                    const p = board.people.find((x) => x.id === pid);
                    return (
                      <div key={pid}>
                        <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted">{p && <Avatar name={p.name} color={p.avatarColor} size={16} />} {p?.name}</div>
                        <div className="space-y-1.5">{ts.map((t) => <Chip key={t.id} task={t} kind="floating" onOpen={() => openTask(t.id)} />)}</div>
                      </div>
                    );
                  })}
                  {floating.size === 0 && <p className="py-4 text-center text-xs text-muted">Every assigned task has a date.</p>}
                </div>
              </Card>
            </aside>
          </div>
          <DragOverlay>{drag && <div className="w-40 rotate-2"><Chip task={drag.task} kind={drag.kind as "block"} onOpen={() => {}} /></div>}</DragOverlay>
        </DndContext>
      )}
      <ConflictDialog state={conflict} onClose={() => setConflict(null)} />
    </div>
  );
}
