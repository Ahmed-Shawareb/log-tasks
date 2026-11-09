"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  Archive, ArrowRightLeft, Ban, CalendarClock, CheckCircle2, Clock, Copy, Download, ExternalLink, FileText, GitBranch, History,
  Link2, MessageSquare, MoreHorizontal, Paperclip, Split, Pencil, Play, Plus, RotateCcw, Send, Trash2, Upload, X,
} from "lucide-react";
import { toast } from "sonner";
import { STATUS_META, type StatusKey } from "@/lib/constants";
import { TRANSITIONS, canTransition, canSubmit } from "@/lib/workflow";
import { api, fmtDate, fmtDateTime, relative } from "@/lib/client";
import { cn, formatMinutes, isOverdue, taskRef } from "@/lib/utils";
import type { TaskFull } from "@/lib/types";
import { Avatar, Badge, Button, ConfirmDialog, Drawer, EmptyState, Input, OverdueBadge, PriorityBadge, Progress, Skeleton, StatusBadge, Tabs, Textarea } from "../ui";
import { useApp } from "../app-context";
import { ReasonDialog, ReassignDialog, ReviewDialog, ScheduleDialog, SubmitDialog } from "./dialogs";
import { EditTaskModal } from "./task-form";
import { DistributeDialog } from "./distribute-dialog";
import { TypeIcon, qtyLabel, stepColor } from "./task-types";

const ACTIVITY_LABEL: Record<string, string> = {
  "task.created": "created the task", "task.reassigned": "handed off the task", "task.status": "changed status", "task.due_changed": "changed the deadline",
  "task.updated": "edited details", "task.submitted": "submitted for review", "task.resubmitted": "resubmitted", "task.approved": "approved",
  "task.changes_requested": "requested changes", "task.scheduled": "scheduled time", "task.unscheduled": "removed the schedule", "task.comment": "commented",
  "task.attachment": "attached a file", "task.dependency_added": "added a dependency", "task.dependency_removed": "removed a dependency",
  "task.archived": "archived", "task.restored": "restored",
};

/** Minimal **bold** + line-break rendering without dangerouslySetInnerHTML (output is always escaped by React). */
function Rich({ text }: { text: string }) {
  return (
    <div className="prose-log whitespace-pre-wrap break-words text-sm leading-relaxed text-fg-2">
      {text.split(/(\*\*[^*]+\*\*|https?:\/\/\S+)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong>
        : /^https?:\/\//.test(part) ? <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow" className="text-accent-2 underline-offset-2 hover:underline">{part}</a>
        : <span key={i}>{part}</span>,
      )}
    </div>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 text-sm">
      <span className="shrink-0 text-xs text-muted">{label}</span>
      <span className="min-w-0 text-right text-fg-2">{children}</span>
    </div>
  );
}

export function TaskDetailView({ id, onClose, variant = "drawer" }: { id: string; onClose?: () => void; variant?: "drawer" | "page" }) {
  const { invalidate, dataVersion, openCreate, openTask } = useApp();
  const [task, setTask] = useState<TaskFull | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "submissions" | "comments" | "activity">("overview");
  const [dialog, setDialog] = useState<null | "reassign" | "submit" | "review-approve" | "review-changes" | "schedule" | "edit" | "archive" | "distribute" | { status: StatusKey }>(null);
  const [menu, setMenu] = useState(false);

  const load = useCallback(async () => {
    try {
      setTask(await api<TaskFull>(`/api/tasks/${id}`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load task");
    }
  }, [id]);
  useEffect(() => { load(); }, [load, dataVersion]);

  const refresh = () => { invalidate(); };

  if (error) return <EmptyState icon={<Ban className="h-6 w-6" />} title="Task unavailable" body={error} action={onClose && <Button onClick={onClose}>Close</Button>} />;
  if (!task) return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-6 w-40" /><Skeleton className="h-9 w-3/4" /><Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" />
    </div>
  );

  const p = task.perms;
  const stepName = task.stage !== null ? task.type?.stages?.[task.stage] : null;
  const status = task.status as StatusKey;
  const moves = TRANSITIONS[status].filter((to) => canTransition(status, to, { canManage: p.canManage, isAssignee: p.isAssignee }));
  const doneChecklist = task.checklist.filter((c) => c.done).length;
  const overdue = isOverdue(task);

  const changeStatus = async (to: StatusKey, reason?: string) => {
    try {
      await api(`/api/tasks/${task.id}/status`, { body: { status: to, version: task.version, reason } });
      toast.success(`Moved to ${STATUS_META[to].label}`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Status change failed");
    }
  };
  const requestStatus = (to: StatusKey) => (to === "BLOCKED" || to === "CANCELLED" || to === "ON_HOLD" ? setDialog({ status: to }) : changeStatus(to));

  const latest = task.submissions[0];
  const mini = { id: task.id, number: task.number, title: task.title, version: task.version, assigneeId: task.assigneeId, department: task.department, scheduledStart: task.scheduledStart, scheduledEnd: task.scheduledEnd, estimateMinutes: task.estimateMinutes };

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", variant === "page" && "glass rounded-3xl")}>
      {/* Header */}
      <div className="border-b border-line px-6 pb-4 pt-5">
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="font-mono">{taskRef(task.number)}</span>
          {task.project && <><span>·</span><Link href={`/projects/${task.project.id}`} className="hover:text-fg">{task.project.client.name} / {task.project.name}</Link></>}
          <div className="ml-auto flex items-center gap-1">
            {variant === "drawer" && <Link href={`/tasks/${task.number}`} className="rounded-lg p-1.5 hover:bg-panel-hover" title="Open full page"><ExternalLink className="h-4 w-4" /></Link>}
            {(p.canManage || p.isAssignee) && (
              <div className="relative">
                <button className="rounded-lg p-1.5 hover:bg-panel-hover" onClick={() => setMenu((m) => !m)} aria-label="More actions"><MoreHorizontal className="h-4 w-4" /></button>
                <AnimatePresence>
                  {menu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
                      <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="glass-strong absolute right-0 top-8 z-50 w-56 rounded-xl p-1 text-sm">
                        {p.canManage && <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 hover:bg-panel-hover" onClick={() => { setMenu(false); setDialog("edit"); }}><Pencil className="h-4 w-4" /> Edit details</button>}
                        {!["APPROVED", "CANCELLED"].includes(status) && <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 hover:bg-panel-hover" onClick={() => { setMenu(false); setDialog("schedule"); }}><CalendarClock className="h-4 w-4" /> {task.scheduledStart ? "Reschedule" : "Book time on calendar"}</button>}
                        {moves.filter((m) => m !== "IN_PROGRESS" || !p.isAssignee).map((m) => (
                          <button key={m} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 hover:bg-panel-hover" onClick={() => { setMenu(false); requestStatus(m); }}>
                            <span className="h-2 w-2 rounded-full" style={{ background: STATUS_META[m].color }} /> Mark {STATUS_META[m].label.toLowerCase()}
                          </button>
                        ))}
                        {p.canManage && <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 hover:bg-panel-hover" onClick={async () => { setMenu(false); try { const t = await api<{ id: string; number: number }>(`/api/tasks/${task.id}/duplicate`, { method: "POST" }); toast.success(`Duplicated as ${taskRef(t.number)}`); openTask(t.id); invalidate(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } }}><Copy className="h-4 w-4" /> Duplicate</button>}
                        {p.canManage && <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-red-300 hover:bg-red-500/10" onClick={() => { setMenu(false); setDialog("archive"); }}><Archive className="h-4 w-4" /> {task.archivedAt ? "Restore" : "Archive"}</button>}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            )}
            {onClose && <button className="rounded-lg p-1.5 hover:bg-panel-hover" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>}
          </div>
        </div>
        <h2 className="mt-2 text-xl font-semibold leading-snug text-fg md:text-2xl">{task.title}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge status={task.status} />
          <PriorityBadge priority={task.priority} />
          {overdue && <OverdueBadge />}
          {task.archivedAt && <Badge color="#94a3b8">Archived</Badge>}
          {task.department && <Badge color={task.department.color}>{task.department.name}</Badge>}
          {task.labels.map((l) => <Badge key={l} color="#a78bfa">#{l}</Badge>)}
        </div>

        {/* Only the actions that make sense right now; everything else lives in the ⋯ menu. */}
        <div className="mt-4 flex flex-wrap gap-2">
          {p.canDistribute && (task.quantity === null || (task.remaining ?? 0) > 0) && (
            <Button variant="primary" size="sm" onClick={() => setDialog("distribute")}><Split className="h-3.5 w-3.5" /> {task.quantity !== null ? "Give out to team" : "Give to someone"}</Button>
          )}
          {p.isAssignee && canSubmit(status) && <Button variant={p.canDistribute ? "secondary" : "primary"} size="sm" onClick={() => setDialog("submit")}><Send className="h-3.5 w-3.5" /> {task.submissions.length ? "Resubmit" : "Submit for review"}</Button>}
          {p.canReview && status === "SUBMITTED" && (
            <>
              <Button variant="success" size="sm" onClick={() => setDialog("review-approve")}><CheckCircle2 className="h-3.5 w-3.5" /> Approve</Button>
              <Button variant="secondary" size="sm" onClick={() => setDialog("review-changes")}><RotateCcw className="h-3.5 w-3.5" /> Request changes</Button>
            </>
          )}
          {moves.includes("IN_PROGRESS") && p.isAssignee && <Button size="sm" onClick={() => changeStatus("IN_PROGRESS")}><Play className="h-3.5 w-3.5" /> {status === "SUBMITTED" ? "Withdraw" : status === "APPROVED" ? "Reopen" : "Start"}</Button>}
          {p.canManage && <Button size="sm" variant="ghost" onClick={() => setDialog("reassign")}><ArrowRightLeft className="h-3.5 w-3.5" /> Hand off</Button>}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-6 p-6 xl:grid-cols-[1fr_260px]">
          <div className="min-w-0 space-y-5">
            {status === "CHANGES_REQUESTED" && latest?.review?.feedback && (
              <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-orange-500/30 bg-orange-500/10 p-4">
                <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-orange-300"><RotateCcw className="h-3.5 w-3.5" /> Changes requested by {latest.review.reviewer.name}</div>
                <Rich text={latest.review.feedback} />
              </motion.div>
            )}
            {task.quantity !== null && (
              <div className="rounded-2xl border border-line bg-panel p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm text-fg"><TypeIcon icon={task.type?.icon} className="h-4 w-4 text-accent-2" /> <span className="font-display text-2xl font-bold">{qtyLabel(task.type, task.quantity)}</span></div>
                  {task.stageRemaining
                    ? <span className="text-xs text-muted">Every unit goes through {task.stageRemaining.length} steps, in order</span>
                    : <span className="text-xs text-muted">{qtyLabel(task.type, task.allocated)} given out · <strong className={cn(task.remaining ? "text-amber-300" : "text-emerald-300")}>{qtyLabel(task.type, task.remaining)} left</strong>{stepName ? <> · {stepName}</> : null}</span>}
                </div>
                {task.stageRemaining ? (
                  <div className="mt-3 space-y-2">
                    {task.stageRemaining.map((left, k) => {
                      const name = task.type?.stages?.[k] ?? `Step ${k + 1}`, c = stepColor(name, k);
                      return (
                        <div key={k} className="flex items-center gap-3 text-xs">
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[10px] font-bold text-white" style={{ background: c }}>{k + 1}</span>
                          <span className="w-32 shrink-0 truncate font-medium text-fg">{name}</span>
                          <Progress className="h-1.5 flex-1" value={((task.quantity! - left) / task.quantity!) * 100} color={c} />
                          <span className="w-24 shrink-0 text-right tabular-nums text-muted">{left ? `${left} left` : "All given out"}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : <Progress className="mt-2" value={task.quantity ? (task.allocated / task.quantity) * 100 : 0} />}
              </div>
            )}
            <Tabs value={tab} onChange={setTab} tabs={[
              { key: "overview", label: "Overview" },
              { key: "submissions", label: "Submissions", count: task.submissions.length },
              { key: "comments", label: "Comments", count: task.comments.length },
              { key: "activity", label: "History" },
            ]} />
            <AnimatePresence mode="wait">
              <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                {tab === "overview" && <Overview task={task} refresh={refresh} onAddSubtask={() => openCreate({ parentId: task.id, department: task.department?.key, projectId: task.projectId ?? undefined })} />}
                {tab === "submissions" && <Submissions task={task} />}
                {tab === "comments" && <Comments task={task} refresh={refresh} />}
                {tab === "activity" && <ActivityTab task={task} />}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Side meta */}
          <aside className="space-y-4">
            <div className="rounded-2xl border border-line bg-panel p-4">
              <MetaRow label="Assignee">{task.assignee ? <span className="inline-flex items-center gap-2"><Avatar name={task.assignee.name} color={task.assignee.avatarColor} size={22} />{task.assignee.name}</span> : <span className="text-muted">Unassigned</span>}</MetaRow>
              <MetaRow label="Reviewer">{task.reviewer?.name ?? <span className="text-muted">Responsible manager</span>}</MetaRow>
              <MetaRow label="Created by">{task.creator.name}</MetaRow>
              <MetaRow label="Deadline"><span className={cn(overdue && "text-red-400")}>{fmtDateTime(task.dueAt)}</span></MetaRow>
              {task.plannedAt && (
                <MetaRow label="Planned finish">
                  <span className={cn(task.dueAt && new Date(task.plannedAt) > new Date(task.dueAt) ? "text-red-400" : "text-sky-400")}>
                    {new Date(task.plannedAt).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}{task.dueAt && new Date(task.plannedAt) > new Date(task.dueAt) ? " · after the deadline" : ""}
                  </span>
                </MetaRow>
              )}
              <MetaRow label="Scheduled">{task.scheduledStart ? <>{fmtDateTime(task.scheduledStart)}<br /><span className="text-xs text-muted">until {new Date(task.scheduledEnd!).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span></> : <span className="text-muted">Not scheduled</span>}</MetaRow>
            </div>
            {task.parent && (
              <button onClick={() => openTask(task.parent!.id)} className="flex w-full items-center gap-2 rounded-2xl border border-line bg-panel p-3 text-left text-xs text-fg-2 hover:border-line-strong">
                <GitBranch className="h-4 w-4 text-accent-2" /> <span className="min-w-0"><span className="block text-muted">Parent task</span><span className="block truncate">{taskRef(task.parent.number)} · {task.parent.title}</span></span>
              </button>
            )}
            {task.handoffs.length > 0 && (
              <div className="rounded-2xl border border-line bg-panel p-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted"><ArrowRightLeft className="h-3.5 w-3.5" /> Ownership trail</div>
                <ol className="relative space-y-3 border-l border-line pl-4">
                  {task.handoffs.map((h) => (
                    <li key={h.id} className="text-xs">
                      <span className="absolute -left-[5px] mt-1 h-2.5 w-2.5 rounded-full bg-accent" />
                      <div className="text-fg-2">{h.fromUser ? `${h.fromUser.name} → ` : ""}<strong className="text-fg">{h.toUser.name}</strong></div>
                      <div className="text-muted">by {h.byUser.name} · {relative(h.createdAt)}</div>
                      {h.note && <div className="mt-1 rounded-lg bg-panel-hover px-2 py-1 text-fg-2">“{h.note}”</div>}
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {task.checklist.length > 0 && (
              <div className="rounded-2xl border border-line bg-panel p-4">
                <div className="mb-2 flex justify-between text-xs text-muted"><span>Checklist</span><span>{doneChecklist}/{task.checklist.length}</span></div>
                <Progress value={(doneChecklist / task.checklist.length) * 100} color="linear-gradient(90deg,#10b981,#22d3ee)" />
              </div>
            )}
          </aside>
        </div>
      </div>

      <DistributeDialog task={{ id: task.id, number: task.number, title: task.title, quantity: task.quantity, remaining: task.remaining, stageRemaining: task.stageRemaining, stage: task.stage, dueAt: task.dueAt, type: task.type }} open={dialog === "distribute"} onClose={() => setDialog(null)} onDone={refresh} />
      <ReassignDialog task={mini} open={dialog === "reassign"} onClose={() => setDialog(null)} onDone={refresh} />
      <SubmitDialog task={mini} open={dialog === "submit"} onClose={() => setDialog(null)} onDone={refresh} openChecklist={task.checklist.length - doneChecklist} />
      <ReviewDialog task={mini} open={dialog === "review-approve" || dialog === "review-changes"} initial={dialog === "review-changes" ? "CHANGES_REQUESTED" : "APPROVED"} onClose={() => setDialog(null)} onDone={refresh} />
      <ScheduleDialog task={mini} open={dialog === "schedule"} onClose={() => setDialog(null)} onDone={refresh} />
      <EditTaskModal task={task} open={dialog === "edit"} onClose={() => setDialog(null)} onDone={refresh} />
      <ReasonDialog open={typeof dialog === "object" && dialog !== null} required={typeof dialog === "object" && dialog?.status !== "ON_HOLD"}
        title={typeof dialog === "object" && dialog ? `Mark as ${STATUS_META[dialog.status].label}` : ""} onClose={() => setDialog(null)}
        onSubmit={async (r) => { if (typeof dialog === "object" && dialog) await changeStatus(dialog.status, r || undefined); }} />
      <ConfirmDialog open={dialog === "archive"} danger={!task.archivedAt} title={task.archivedAt ? "Restore task?" : "Archive task?"} confirmLabel={task.archivedAt ? "Restore" : "Archive"}
        body={task.archivedAt ? "The task and its subtasks return to boards and lists." : "The task and its subtasks are hidden from boards and lists. History is kept and it can be restored."}
        onClose={() => setDialog(null)}
        onConfirm={async () => { try { await api(`/api/tasks/${task.id}/archive`, { body: { archived: !task.archivedAt } }); toast.success(task.archivedAt ? "Restored" : "Archived"); setDialog(null); refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } }} />

    </div>
  );
}

// ───────────────────────────── Tabs ─────────────────────────────

function Overview({ task, refresh, onAddSubtask }: { task: TaskFull; refresh: () => void; onAddSubtask: () => void }) {
  const p = task.perms;
  const canContribute = p.canManage || p.isAssignee;
  const [item, setItem] = useState("");
  const [dep, setDep] = useState("");
  const [uploading, setUploading] = useState(false);
  const toggle = async (id: string, done: boolean) => {
    try { await api(`/api/checklist/${id}`, { method: "PATCH", body: { done } }); refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };
  return (
    <div className="space-y-6">
      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Description</h4>
        {task.description ? <Rich text={task.description} /> : <p className="text-sm text-muted">No description yet.</p>}
      </section>

      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Checklist</h4>
        <ul className="space-y-1">
          {task.checklist.map((c) => (
            <motion.li layout key={c.id} className="group flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-panel-hover">
              <input type="checkbox" checked={c.done} disabled={!canContribute} onChange={(e) => toggle(c.id, e.target.checked)} className="h-4 w-4 cursor-pointer accent-violet-500" aria-label={c.text} />
              <span className={cn("flex-1 text-sm", c.done ? "text-muted line-through" : "text-fg-2")}>{c.text}</span>
              {p.canManage && <button className="opacity-0 transition group-hover:opacity-100" onClick={async () => { await api(`/api/checklist/${c.id}`, { method: "DELETE" }); refresh(); }} aria-label="Delete item"><Trash2 className="h-3.5 w-3.5 text-muted" /></button>}
            </motion.li>
          ))}
        </ul>
        {canContribute && (
          <form className="mt-2 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (!item.trim()) return; try { await api(`/api/tasks/${task.id}/checklist`, { body: { text: item } }); setItem(""); refresh(); } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); } }}>
            <Input value={item} onChange={(e) => setItem(e.target.value)} placeholder="Add checklist item" className="h-9" />
            <Button size="sm" type="submit"><Plus className="h-3.5 w-3.5" /></Button>
          </form>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">Subtasks ({task.children.length})</h4>
          {(p.canManage || p.isAssignee) && <Button size="sm" variant="ghost" onClick={onAddSubtask}><Plus className="h-3.5 w-3.5" /> Add subtask</Button>}
        </div>
        {task.children.length === 0 ? <p className="text-sm text-muted">No subtasks.</p> : (
          <SubtaskList children={task.children} />
        )}
      </section>

      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Dependencies</h4>
        {task.dependencies.length === 0 && task.dependents.length === 0 && <p className="text-sm text-muted">No dependencies.</p>}
        <div className="space-y-1.5">
          {task.dependencies.map((d) => (
            <div key={d.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
              <span className="text-xs text-muted">Waits for</span>
              <span className="font-mono text-xs text-muted">{taskRef(d.dependsOn.number)}</span>
              <span className="min-w-0 flex-1 truncate text-fg-2">{d.dependsOn.title}</span>
              <StatusBadge status={d.dependsOn.status} />
              {p.canManage && <button onClick={async () => { await api(`/api/tasks/${task.id}/dependencies?dependsOnId=${d.dependsOnId}`, { method: "DELETE" }); refresh(); }} aria-label="Remove dependency"><X className="h-3.5 w-3.5 text-muted" /></button>}
            </div>
          ))}
          {task.dependents.map((d) => (
            <div key={d.id} className="flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2 text-sm">
              <span className="text-xs text-muted">Blocks</span>
              <span className="font-mono text-xs text-muted">{taskRef(d.task.number)}</span>
              <span className="min-w-0 flex-1 truncate text-fg-2">{d.task.title}</span>
              <StatusBadge status={d.task.status} />
            </div>
          ))}
        </div>
        {p.canManage && (
          <form className="mt-2 flex gap-2" onSubmit={async (e) => {
            e.preventDefault();
            const num = dep.replace(/^log-/i, "").trim();
            if (!num) return;
            try {
              const target = await api<{ id: string }>(`/api/tasks/${num}`);
              await api(`/api/tasks/${task.id}/dependencies`, { body: { dependsOnId: target.id } });
              setDep(""); refresh();
            } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
          }}>
            <Input value={dep} onChange={(e) => setDep(e.target.value)} placeholder="Depends on… (e.g. LOG-12)" className="h-9" />
            <Button size="sm" type="submit">Add</Button>
          </form>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">Files ({task.attachments.length})</h4>
          {(p.canManage || p.isAssignee) && (
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-accent-2 hover:bg-panel-hover">
              <Upload className="h-3.5 w-3.5" /> {uploading ? "Uploading…" : "Upload"}
              <input type="file" hidden onChange={async (e) => {
                const f = e.target.files?.[0]; if (!f) return;
                setUploading(true);
                const form = new FormData(); form.append("file", f);
                try { await api(`/api/tasks/${task.id}/attachments`, { form }); toast.success("File uploaded"); refresh(); } catch (err) { toast.error(err instanceof Error ? err.message : "Upload failed"); }
                setUploading(false); e.target.value = "";
              }} />
            </label>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {task.attachments.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2">
              <FileText className="h-5 w-5 shrink-0 text-accent-2" />
              <div className="min-w-0 flex-1">
                <a href={`/api/attachments/${a.id}`} className="block truncate text-sm text-fg hover:underline">{a.fileName}</a>
                <span className="text-[10px] text-muted">{(a.size / 1024).toFixed(0)} KB · {a.uploader.name}{a.submissionId ? " · in submission" : ""}</span>
              </div>
              <a href={`/api/attachments/${a.id}`} aria-label="Download"><Download className="h-4 w-4 text-muted" /></a>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SubtaskList({ children }: { children: TaskFull["children"] }) {
  const { openTask } = useApp();
  return (
    <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-line">
      {children.map((c) => (
        <li key={c.id}>
          <button onClick={() => openTask(c.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-panel-hover">
            <span className="font-mono text-[11px] text-muted">{taskRef(c.number)}</span>
            <span className="min-w-0 flex-1 truncate text-fg-2">{c.title}</span>
            {isOverdue(c) && <OverdueBadge />}
            <StatusBadge status={c.status} />
            {c.assignee ? <Avatar name={c.assignee.name} color={c.assignee.avatarColor} size={22} /> : <span className="text-[10px] text-muted">—</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

function Submissions({ task }: { task: TaskFull }) {
  if (!task.submissions.length) return <EmptyState icon={<Send className="h-6 w-6" />} title="No submissions yet" body="When the assignee submits work, each revision appears here with the reviewer’s decision." />;
  return (
    <ol className="space-y-4">
      {task.submissions.map((s, i) => (
        <motion.li key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
          className={cn("rounded-2xl border p-4", i === 0 ? "border-accent/40 bg-accent-soft/30" : "border-line bg-panel")}>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge color={i === 0 ? "#a78bfa" : "#64748b"}>Revision {s.revision}{i === 0 ? " · latest" : ""}</Badge>
            <span className="text-muted">by {s.submitter.name} · {fmtDateTime(s.createdAt)}</span>
            <span className="ml-auto">
              {s.review ? (s.review.decision === "APPROVED" ? <Badge color="#10b981">Approved</Badge> : <Badge color="#f97316">Changes requested</Badge>) : <Badge color="#f59e0b">Awaiting review</Badge>}
            </span>
          </div>
          <div className="mt-3"><Rich text={s.notes} /></div>
          {s.links.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {s.links.map((l) => <a key={l} href={l} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-full items-center gap-1.5 truncate rounded-lg border border-line px-2 py-1 text-xs text-accent-2 hover:bg-panel-hover"><Link2 className="h-3 w-3" />{l}</a>)}
            </div>
          )}
          {s.attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {s.attachments.map((a) => <a key={a.id} href={`/api/attachments/${a.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-xs text-fg-2 hover:bg-panel-hover"><Paperclip className="h-3 w-3" />{a.fileName}</a>)}
            </div>
          )}
          {s.review && (
            <div className="mt-3 rounded-xl border border-line bg-[var(--bg)]/40 p-3">
              <div className="text-xs text-muted">{s.review.reviewer.name} · {fmtDateTime(s.review.createdAt)}</div>
              {s.review.feedback ? <Rich text={s.review.feedback} /> : <p className="text-xs text-muted">No written feedback.</p>}
            </div>
          )}
        </motion.li>
      ))}
    </ol>
  );
}

function Comments({ task, refresh }: { task: TaskFull; refresh: () => void }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-4">
      {task.comments.length === 0 && <p className="text-sm text-muted">No comments yet. Start the conversation.</p>}
      <ul className="space-y-3">
        {task.comments.map((c) => (
          <motion.li key={c.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="flex gap-3">
            <Avatar name={c.author.name} color={c.author.avatarColor} size={30} />
            <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-line bg-panel px-4 py-2.5">
              <div className="text-xs"><span className="font-semibold text-fg">{c.author.name}</span> <span className="text-muted">· {relative(c.createdAt)}</span></div>
              <Rich text={c.body} />
            </div>
          </motion.li>
        ))}
      </ul>
      <form className="space-y-2" onSubmit={async (e) => {
        e.preventDefault();
        if (!body.trim()) return;
        setBusy(true);
        try { await api(`/api/tasks/${task.id}/comments`, { body: { body } }); setBody(""); refresh(); } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); } finally { setBusy(false); }
      }}>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a comment… (Ctrl+Enter to send)" onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) (e.currentTarget.form as HTMLFormElement).requestSubmit(); }} />
        <div className="flex justify-end"><Button variant="primary" size="sm" loading={busy} type="submit"><MessageSquare className="h-3.5 w-3.5" /> Comment</Button></div>
      </form>
    </div>
  );
}

function ActivityTab({ task }: { task: TaskFull }) {
  return (
    <ol className="relative space-y-4 border-l border-line pl-5">
      {task.activities.map((a) => {
        const d = (a.data ?? {}) as Record<string, unknown>;
        return (
          <li key={a.id} className="text-sm">
            <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-500" />
            <div className="text-fg-2"><strong className="text-fg">{a.actor?.name ?? "System"}</strong> {ACTIVITY_LABEL[a.action] ?? a.action}
              {a.action === "task.status" && d.from && d.to ? <> · {STATUS_META[d.from as StatusKey]?.label} → <strong>{STATUS_META[d.to as StatusKey]?.label}</strong></> : null}
              {a.action === "task.due_changed" ? <> · {fmtDateTime(d.from as string)} → <strong>{fmtDateTime(d.to as string)}</strong></> : null}
              {a.action === "task.scheduled" && d.start ? <> · {fmtDateTime(d.start as string)}</> : null}
              {(a.action === "task.submitted" || a.action === "task.resubmitted") && d.revision ? <> · revision {String(d.revision)}</> : null}
            </div>
            {typeof d.reason === "string" && d.reason && <div className="mt-1 text-xs text-muted">“{d.reason}”</div>}
            {typeof d.feedback === "string" && d.feedback && <div className="mt-1 text-xs text-muted">“{d.feedback}”</div>}
            <div className="text-[11px] text-muted">{fmtDateTime(a.createdAt)}</div>
          </li>
        );
      })}
      {task.activities.length === 0 && <li className="text-sm text-muted"><History className="mr-1 inline h-4 w-4" /> No history.</li>}
    </ol>
  );
}

export function TaskDrawerHost() {
  const { openTaskId, closeTask } = useApp();
  return <DrawerWrap id={openTaskId} onClose={closeTask} />;
}

function DrawerWrap({ id, onClose }: { id: string | null; onClose: () => void }) {
  return (
    <Drawer open={!!id} onClose={onClose} width={900}>
      {id && <TaskDetailView key={id} id={id} onClose={onClose} />}
    </Drawer>
  );
}
