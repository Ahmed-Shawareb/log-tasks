"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin, { Draggable } from "@fullcalendar/interaction";
import type { EventApi, EventContentArg, EventDropArg, EventInput } from "@fullcalendar/core";
import type { EventReceiveArg, EventResizeDoneArg } from "@fullcalendar/interaction";
import { motion } from "motion/react";
import { CalendarClock, ChevronLeft, ChevronRight, Flag, GripVertical, Inbox, Plane } from "lucide-react";
import { toast } from "sonner";
import { PRIORITY_META, STATUS_META, type PriorityKey, type StatusKey } from "@/lib/constants";
import { api, fmtDate, qs } from "@/lib/client";
import { cn, isOverdue, taskRef } from "@/lib/utils";
import type { TaskItem } from "@/lib/types";
import { useApp } from "@/components/app-context";
import { ConflictDialog, isConflict, type ConflictState } from "@/components/tasks/dialogs";
import { useEligible, useProjects } from "@/components/tasks/pickers";
import { Badge, Button, Card, PageHeader, PriorityBadge, Segmented, Select } from "@/components/ui";
import { DEPARTMENTS } from "@/lib/constants";

type Feed = { scheduled: TaskItem[]; deadlines: TaskItem[]; unscheduled: TaskItem[]; leaves: { id: string; type: string; startsAt: string; endsAt: string; note: string | null; user: { id: string; name: string } }[] };
type View = "timeGridDay" | "timeGridWeek" | "dayGridMonth" | "listWeek";
type Scope = "mine" | "person" | "team" | "project" | "department" | "company";

const DEFAULT_HOURS = { daysOfWeek: [0, 1, 2, 3, 4], startTime: "09:00", endTime: "18:00" };

export function CalendarClient() {
  const { user, isManager, isAdmin, openTask, dataVersion, invalidate } = useApp();
  const sp = useSearchParams();
  const calRef = useRef<FullCalendar>(null);
  const queueRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>("timeGridWeek");
  const [title, setTitle] = useState("");
  const [range, setRange] = useState<{ start: Date; end: Date } | null>(null);
  const [scope, setScope] = useState<Scope>(sp.get("assigneeId") ? "person" : isManager ? (isAdmin ? "company" : "department") : "mine");
  const [personId, setPersonId] = useState(sp.get("assigneeId") ?? "");
  const [teamId, setTeamId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [dept, setDept] = useState(user.departmentKey && ["PERFORMANCE", "PRODUCTION"].includes(user.departmentKey) ? user.departmentKey : "");
  const [show, setShow] = useState({ scheduled: true, deadlines: true, leave: true });
  const [priority, setPriority] = useState("");
  const [feed, setFeed] = useState<Feed | null>(null);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const { people } = useEligible(null);
  const projects = useProjects();

  useEffect(() => { if (isManager) api<{ id: string; name: string }[]>("/api/teams").then(setTeams).catch(() => {}); }, [isManager]);

  const filters = useMemo(() => ({
    assigneeId: scope === "mine" ? user.id : scope === "person" ? personId || undefined : undefined,
    teamId: scope === "team" ? teamId || undefined : undefined,
    projectId: scope === "project" ? projectId || undefined : undefined,
    department: scope === "department" ? dept || undefined : undefined,
    priority: priority || undefined,
  }), [scope, personId, teamId, projectId, dept, priority, user.id]);

  const load = useCallback(async () => {
    if (!range) return;
    try {
      setFeed(await api<Feed>(`/api/calendar${qs({ from: range.start.toISOString(), to: range.end.toISOString(), ...filters })}`));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not load calendar"); }
  }, [range, filters]);
  useEffect(() => { load(); }, [load, dataVersion]);

  // Unscheduled queue → drag onto the calendar.
  useEffect(() => {
    if (!queueRef.current) return;
    const d = new Draggable(queueRef.current, {
      itemSelector: "[data-task-id]",
      eventData: (el) => ({
        id: `drop-${el.getAttribute("data-task-id")}`,
        title: el.getAttribute("data-title") ?? "",
        duration: { minutes: Number(el.getAttribute("data-minutes") || 120) },
        extendedProps: { taskId: el.getAttribute("data-task-id"), version: Number(el.getAttribute("data-version")) },
        create: true,
      }),
    });
    return () => d.destroy();
  }, [feed]);

  const canEditTask = useCallback((t: TaskItem) => isManager || t.assigneeId === user.id, [isManager, user.id]);

  const events: EventInput[] = useMemo(() => {
    if (!feed) return [];
    const out: EventInput[] = [];
    if (show.scheduled) for (const t of feed.scheduled) {
      const s = STATUS_META[t.status as StatusKey];
      out.push({
        id: `s-${t.id}`, title: t.title, start: t.scheduledStart!, end: t.scheduledEnd!, backgroundColor: `color-mix(in srgb, ${s.color} 32%, var(--panel-solid))`,
        borderColor: PRIORITY_META[t.priority as PriorityKey].color, textColor: "var(--fg)",
        editable: canEditTask(t) && !["APPROVED", "CANCELLED"].includes(t.status), extendedProps: { kind: "scheduled", task: t },
      });
    }
    if (show.deadlines) for (const t of feed.deadlines) {
      out.push({
        id: `d-${t.id}`, title: t.title, start: t.dueAt!, allDay: false, classNames: ["deadline-event"], durationEditable: false,
        startEditable: isManager && !["APPROVED", "CANCELLED"].includes(t.status), display: "block", extendedProps: { kind: "deadline", task: t },
      });
    }
    if (show.leave) for (const l of feed.leaves) {
      out.push({ id: `l-${l.id}`, title: `${l.user.name} · ${l.type.toLowerCase()}`, start: l.startsAt, end: l.endsAt, classNames: ["leave-event"], editable: false, extendedProps: { kind: "leave" } });
    }
    return out;
  }, [feed, show, canEditTask, isManager]);

  const selectedPerson = people.find((p) => p.id === (scope === "mine" ? user.id : personId));
  const businessHours = selectedPerson
    ? { daysOfWeek: selectedPerson.workDays.map((d) => d % 7), startTime: `${String(Math.floor(selectedPerson.workStartMin / 60)).padStart(2, "0")}:${String(selectedPerson.workStartMin % 60).padStart(2, "0")}`, endTime: `${String(Math.floor(selectedPerson.workEndMin / 60)).padStart(2, "0")}:${String(selectedPerson.workEndMin % 60).padStart(2, "0")}` }
    : DEFAULT_HOURS;

  async function schedule(task: { id: string; version: number }, start: Date, end: Date, revert?: () => void) {
    try {
      await api(`/api/tasks/${task.id}/schedule`, { body: { start: start.toISOString(), end: end.toISOString(), version: task.version } });
      toast.success("Schedule saved");
      invalidate();
    } catch (e) {
      revert?.();
      if (isConflict(e)) setConflict({ message: e.message, details: e.details, onPick: (s) => schedule(task, new Date(s.start), new Date(s.end)) });
      else toast.error(e instanceof Error ? e.message : "Could not save schedule");
      load();
    }
  }

  async function onDrop(info: EventDropArg) {
    const kind = info.event.extendedProps.kind as string;
    const task = info.event.extendedProps.task as TaskItem;
    if (kind === "deadline") {
      try {
        await api(`/api/tasks/${task.id}`, { method: "PATCH", body: { dueAt: info.event.start!.toISOString(), version: task.version } });
        toast.success(`Deadline moved to ${fmtDate(info.event.start!, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`);
        invalidate();
      } catch (e) { info.revert(); toast.error(e instanceof Error ? e.message : "Could not move deadline"); }
      return;
    }
    if (info.event.allDay) { info.revert(); return toast.info("Drop scheduled work into a time slot (use Week or Day view)."); }
    schedule(task, info.event.start!, info.event.end ?? new Date(info.event.start!.getTime() + 3600_000), info.revert);
  }
  function onResize(info: EventResizeDoneArg) {
    const task = info.event.extendedProps.task as TaskItem;
    schedule(task, info.event.start!, info.event.end!, info.revert);
  }
  function onReceive(info: EventReceiveArg) {
    const { taskId, version } = info.event.extendedProps as { taskId: string; version: number };
    const start = info.event.start!;
    const end = info.event.end ?? new Date(start.getTime() + 2 * 3600_000);
    info.event.remove(); // the server is the source of truth; reload shows the saved block
    if (info.event.allDay) return toast.info("Drop into a time slot (Week or Day view) to book time.");
    schedule({ id: taskId, version }, start, end);
  }

  const renderEvent = (arg: EventContentArg) => {
    const kind = arg.event.extendedProps.kind as string;
    const t = arg.event.extendedProps.task as TaskItem | undefined;
    if (kind === "leave") return <div className="flex items-center gap-1 truncate px-1 text-[11px]"><Plane className="h-3 w-3" /> {arg.event.title}</div>;
    if (!t) return null;
    const overdue = isOverdue(t);
    if (kind === "deadline") {
      return (
        <div className={cn("flex items-center gap-1 truncate px-1 text-[11px]", overdue ? "text-red-300" : "text-fg-2")} title={`Deadline · ${t.title}`}>
          <Flag className="h-3 w-3 shrink-0 text-red-400" /> <span className="font-mono text-[10px] opacity-70">{taskRef(t.number)}</span> <span className="truncate">{t.title}</span>
        </div>
      );
    }
    return (
      <div className="flex h-full flex-col overflow-hidden border-l-[3px] px-1.5 py-0.5" style={{ borderColor: PRIORITY_META[t.priority as PriorityKey].color }}>
        <div className="flex items-center gap-1 text-[10px] opacity-80"><span className="font-mono">{taskRef(t.number)}</span>{arg.timeText && <span>· {arg.timeText}</span>}</div>
        <div className="truncate text-[12px] font-medium leading-tight">{t.title}</div>
        {t.assignee && view !== "dayGridMonth" && <div className="mt-auto truncate text-[10px] opacity-75">{t.assignee.name}</div>}
      </div>
    );
  };

  const api_ = () => calRef.current?.getApi();
  const VIEWS: { key: View; label: string }[] = [{ key: "timeGridDay", label: "Day" }, { key: "timeGridWeek", label: "Week" }, { key: "dayGridMonth", label: "Month" }, { key: "listWeek", label: "Agenda" }];

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Plan" title="Calendar" subtitle="Scheduled work blocks, deadlines and leave in one place. Drag to reschedule; drag the edge to resize."
        actions={<Segmented options={VIEWS} value={view} onChange={(v) => { setView(v); api_()?.changeView(v); }} />} />

      <div className="glass flex flex-wrap items-center gap-2 rounded-2xl p-2">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => api_()?.prev()} aria-label="Previous"><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="sm" onClick={() => api_()?.today()}>Today</Button>
          <Button size="icon" variant="ghost" onClick={() => api_()?.next()} aria-label="Next"><ChevronRight className="h-4 w-4" /></Button>
          <motion.h2 key={title} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="ml-2 min-w-40 font-display text-xl font-bold">{title}</motion.h2>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select className="h-9 w-auto" value={scope} onChange={(e) => setScope(e.target.value as Scope)} aria-label="Calendar scope">
            <option value="mine">My schedule</option>
            {isManager && <option value="person">Employee schedule</option>}
            {isManager && <option value="team">Team schedule</option>}
            {isManager && <option value="department">Department</option>}
            {projects.length > 0 && <option value="project">Project schedule</option>}
            {isManager && <option value="company">{isAdmin ? "Company-wide" : "Everything I manage"}</option>}
          </Select>
          {scope === "person" && <Select className="h-9 w-auto" value={personId} onChange={(e) => setPersonId(e.target.value)} aria-label="Person"><option value="">Choose person…</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}
          {scope === "team" && <Select className="h-9 w-auto" value={teamId} onChange={(e) => setTeamId(e.target.value)} aria-label="Team"><option value="">Choose team…</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>}
          {scope === "project" && <Select className="h-9 w-auto" value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Project"><option value="">Choose project…</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}
          {scope === "department" && <Select className="h-9 w-auto" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department"><option value="">All departments</option>{DEPARTMENTS.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}</Select>}
          <Select className="h-9 w-auto" value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority"><option value="">Any priority</option>{Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
          {(["scheduled", "deadlines", "leave"] as const).map((k) => (
            <button key={k} onClick={() => setShow((s) => ({ ...s, [k]: !s[k] }))}
              className={cn("h-9 rounded-xl border px-3 text-xs font-medium capitalize transition", show[k] ? "border-accent/50 bg-accent-soft text-fg" : "border-line text-muted")}>
              {k === "scheduled" ? "Work blocks" : k}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <Card className="overflow-hidden p-3">
          <FullCalendar
            ref={calRef}
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            initialView={view}
            headerToolbar={false}
            height="auto"
            contentHeight={680}
            expandRows
            nowIndicator
            firstDay={0}
            slotMinTime="07:00:00"
            slotMaxTime="22:00:00"
            slotDuration="00:30:00"
            snapDuration="00:15:00"
            scrollTime="08:30:00"
            businessHours={businessHours}
            dayMaxEvents={4}
            events={events}
            editable
            droppable
            eventDurationEditable
            eventContent={renderEvent}
            eventClick={(info) => { const t = info.event.extendedProps.task as TaskItem | undefined; if (t) openTask(t.id); }}
            eventDrop={onDrop}
            eventResize={onResize}
            eventReceive={onReceive}
            eventAllow={(_span, moving: EventApi | null) => !moving || moving.extendedProps.kind !== "leave"}
            datesSet={(arg) => { setTitle(arg.view.title); setRange({ start: arg.start, end: arg.end }); }}
            allDaySlot={false}
          />
        </Card>

        <aside className="space-y-4">
          <Card>
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <Inbox className="h-4 w-4 text-accent-2" /><span className="text-sm font-semibold">Unscheduled</span>
              <Badge className="ml-auto" color="#a78bfa">{feed?.unscheduled.length ?? 0}</Badge>
            </div>
            <p className="px-4 pt-3 text-[11px] text-muted">Drag a task onto a time slot to book it. Availability is checked before saving.</p>
            <div ref={queueRef} className="max-h-[560px] space-y-2 overflow-y-auto p-3">
              {feed?.unscheduled.filter(canEditTask).map((t) => (
                <div key={t.id} data-task-id={t.id} data-title={t.title} data-minutes={t.estimateMinutes ?? 120} data-version={t.version}
                  className="group flex cursor-grab items-start gap-2 rounded-xl border border-line bg-panel p-2.5 transition hover:border-accent/50 hover:shadow-glow active:cursor-grabbing">
                  <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[10px] text-muted"><span className="font-mono">{taskRef(t.number)}</span>{t.assignee && <span className="truncate">· {t.assignee.name}</span>}</div>
                    <button className="block w-full truncate text-left text-xs font-medium text-fg hover:underline" onClick={() => openTask(t.id)}>{t.title}</button>
                    <div className="mt-1 flex items-center gap-2"><PriorityBadge priority={t.priority} compact />{t.dueAt && <span className={cn("text-[10px]", isOverdue(t) ? "text-red-400" : "text-muted")}>due {fmtDate(t.dueAt)}</span>}</div>
                  </div>
                </div>
              ))}
              {feed && feed.unscheduled.filter(canEditTask).length === 0 && <p className="py-6 text-center text-xs text-muted">Everything is scheduled ✨</p>}
            </div>
          </Card>
          <Card className="space-y-2 p-4 text-[11px] text-muted">
            <div className="mb-1 text-xs font-semibold text-fg">Legend</div>
            <div className="flex items-center gap-2"><span className="h-3 w-5 rounded border-l-[3px] border-amber-400 bg-violet-500/30" /> Work block: fill = status, edge = priority</div>
            <div className="flex items-center gap-2"><span className="h-3 w-5 rounded border border-dashed border-red-400" /> Deadline (managers can drag)</div>
            <div className="flex items-center gap-2"><span className="leave-swatch h-3 w-5 rounded border border-line-strong bg-[repeating-linear-gradient(45deg,var(--line-strong),var(--line-strong)_3px,transparent_3px,transparent_6px)]" /> Leave / unavailable</div>
            <div className="flex items-center gap-2"><CalendarClock className="h-3.5 w-3.5" /> Shaded hours are outside working time</div>
          </Card>
        </aside>
      </div>
      <ConflictDialog state={conflict} onClose={() => setConflict(null)} />
    </div>
  );
}
