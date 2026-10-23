"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { AlertOctagon, ArrowRightLeft, CalendarCheck2, CheckCircle2, Link2, Paperclip, Plus, RotateCcw, Send, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { ApiError, api, fmtDateTime, fromLocalInput, toLocalInput, type Availability } from "@/lib/client";
import { taskRef } from "@/lib/utils";
import { Button, Field, Input, Modal, Textarea } from "../ui";
import { AssigneeSelect } from "./pickers";

// ───────────────────────── Availability conflict ─────────────────────────

export type ConflictState = {
  message: string;
  details: Availability;
  onPick?: (slot: { start: string; end: string }) => void;
  onUnschedule?: () => void;
};

export function ConflictDialog({ state, onClose }: { state: ConflictState | null; onClose: () => void }) {
  return (
    <Modal open={!!state} onClose={onClose} size="sm" title={<span className="flex items-center gap-2 text-red-300"><AlertOctagon className="h-5 w-5" /> Scheduling conflict</span>}
      footer={<Button variant="ghost" onClick={onClose}>Keep as is</Button>}>
      {state && (
        <div className="space-y-4">
          <p className="text-base font-semibold text-fg" role="alert">{state.message}</p>
          {state.details.conflicts?.length > 0 && (
            <ul className="space-y-1.5">
              {state.details.conflicts.map((c, i) => (
                <li key={i} className="flex gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-fg-2"><span className="text-red-400">•</span>{c.message}</li>
              ))}
            </ul>
          )}
          {state.onPick && state.details.suggestions?.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Next available slots</div>
              <div className="grid gap-2">
                {state.details.suggestions.map((s) => (
                  <motion.button whileHover={{ x: 3 }} key={s.start} onClick={() => { state.onPick!(s); onClose(); }}
                    className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-left text-sm text-emerald-200 hover:bg-emerald-500/15">
                    <CalendarCheck2 className="h-4 w-4" /> {fmtDateTime(s.start)} → {new Date(s.end).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </motion.button>
                ))}
              </div>
            </div>
          )}
          {state.onUnschedule && state.details.canUnschedule && (
            <Button variant="secondary" className="w-full" onClick={() => { state.onUnschedule!(); onClose(); }}>
              Assign anyway and clear the booked slot (keeps the deadline)
            </Button>
          )}
        </div>
      )}
    </Modal>
  );
}

export function isConflict(e: unknown): e is ApiError & { details: Availability } {
  return e instanceof ApiError && e.code === "UNAVAILABLE";
}

// ───────────────────────── Reassign / hand-off ─────────────────────────

type MiniTask = { id: string; number: number; title: string; version: number; assigneeId: string | null; department: { key: string } | null; scheduledStart: string | null };

export function ReassignDialog({ task, open, onClose, onDone }: { task: MiniTask | null; open: boolean; onClose: () => void; onDone: () => void }) {
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  useEffect(() => { if (open) { setTo(""); setNote(""); } }, [open]);
  if (!task) return null;

  const send = async (onConflict?: "unschedule") => {
    setBusy(true);
    try {
      const r = await api<{ freedSlot?: boolean }>(`/api/tasks/${task.id}`, { method: "PATCH", body: { assigneeId: to || null, handoffNote: note || undefined, version: task.version, onConflict } });
      toast.success(to ? `Handed off ${taskRef(task.number)}` : "Unassigned", { description: r.freedSlot ? "The booked slot was cleared because the new assignee is busy then." : undefined });
      onClose();
      onDone();
    } catch (e) {
      if (isConflict(e)) {
        setConflict({ message: e.message, details: e.details, onUnschedule: () => send("unschedule") });
      } else toast.error(e instanceof Error ? e.message : "Could not reassign");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title={<span className="flex items-center gap-2"><ArrowRightLeft className="h-4 w-4 text-accent-2" /> Hand off {taskRef(task.number)}</span>}
        subtitle="Ownership moves in one step. History, the hand-off note and notifications are recorded automatically."
        footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => send()} disabled={to === (task.assigneeId ?? "")}>Hand off</Button></>}>
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-panel px-3 py-2 text-sm text-fg-2">{task.title}</div>
          <Field label="New owner" hint="Only active people eligible for this task’s department are listed.">
            <AssigneeSelect department={task.department?.key} value={to} onChange={setTo} exclude={task.assigneeId} />
          </Field>
          <Field label="Hand-off note" hint="What does the next person need to know?">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Context, where files are, what’s left…" maxLength={2000} />
          </Field>
          {task.scheduledStart && <p className="text-xs text-muted">This task is booked for {fmtDateTime(task.scheduledStart)}. The new owner’s availability will be checked for that slot.</p>}
        </div>
      </Modal>
      <ConflictDialog state={conflict} onClose={() => setConflict(null)} />
    </>
  );
}

// ───────────────────────── Submit for review ─────────────────────────

export function SubmitDialog({ task, open, onClose, onDone, openChecklist }: { task: MiniTask | null; open: boolean; onClose: () => void; onDone: () => void; openChecklist?: number }) {
  const [notes, setNotes] = useState("");
  const [links, setLinks] = useState<string[]>([""]);
  const [files, setFiles] = useState<{ id: string; fileName: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setNotes(""); setLinks([""]); setFiles([]); } }, [open]);
  if (!task) return null;

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    for (const f of Array.from(list)) {
      const form = new FormData();
      form.append("file", f);
      try {
        const att = await api<{ id: string; fileName: string }>(`/api/tasks/${task.id}/attachments`, { form });
        setFiles((x) => [...x, att]);
      } catch (e) {
        toast.error(`${f.name}: ${e instanceof Error ? e.message : "upload failed"}`);
      }
    }
    setUploading(false);
  };

  const submit = async () => {
    setBusy(true);
    try {
      await api(`/api/tasks/${task.id}/submit`, { body: { notes, links: links.map((l) => l.trim()).filter(Boolean), attachmentIds: files.map((f) => f.id), version: task.version } });
      toast.success("Submitted for review", { description: "Your reviewer has been notified." });
      onClose();
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" title={<span className="flex items-center gap-2"><Send className="h-4 w-4 text-accent-2" /> Submit {taskRef(task.number)} for review</span>}
      subtitle="Each submission is kept as a revision. Earlier ones are never overwritten."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={uploading || notes.trim().length < 3} onClick={submit}>Submit</Button></>}>
      <div className="space-y-5">
        {!!openChecklist && <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{openChecklist} checklist item{openChecklist > 1 ? "s are" : " is"} still unchecked.</p>}
        <Field label="What did you deliver?"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Summary, decisions made, anything the reviewer should check…" className="min-h-[120px]" /></Field>
        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-wider text-muted">Deliverable links</div>
          {links.map((l, i) => (
            <div key={i} className="flex gap-2">
              <div className="relative flex-1"><Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input className="pl-9" value={l} placeholder="https://drive.google.com/…" onChange={(e) => setLinks((x) => x.map((v, j) => (j === i ? e.target.value : v)))} /></div>
              {links.length > 1 && <Button variant="ghost" size="icon" onClick={() => setLinks((x) => x.filter((_, j) => j !== i))} aria-label="Remove link"><X className="h-4 w-4" /></Button>}
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={() => setLinks((x) => [...x, ""])}><Plus className="h-3.5 w-3.5" /> Add link</Button>
        </div>
        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-wider text-muted">Files</div>
          <button type="button" onClick={() => fileRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files); }}
            className="flex w-full flex-col items-center gap-1 rounded-2xl border border-dashed border-line-strong px-4 py-6 text-sm text-muted transition hover:border-accent hover:bg-accent-soft/30">
            <Upload className="h-5 w-5" /> {uploading ? "Uploading…" : "Drop files or click to upload"}
            <span className="text-[11px]">Images, PDF, Office, ZIP, MP4 · size limit applies; share larger files as links</span>
          </button>
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
          {files.map((f) => <div key={f.id} className="flex items-center gap-2 text-xs text-fg-2"><Paperclip className="h-3.5 w-3.5" /> {f.fileName}</div>)}
        </div>
      </div>
    </Modal>
  );
}

// ───────────────────────── Review ─────────────────────────

export function ReviewDialog({ task, open, initial, onClose, onDone }: { task: MiniTask | null; open: boolean; initial?: "APPROVED" | "CHANGES_REQUESTED"; onClose: () => void; onDone: () => void }) {
  const [decision, setDecision] = useState<"APPROVED" | "CHANGES_REQUESTED">(initial ?? "APPROVED");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setDecision(initial ?? "APPROVED"); setFeedback(""); } }, [open, initial]);
  if (!task) return null;
  const needsReason = decision === "CHANGES_REQUESTED";
  const send = async () => {
    setBusy(true);
    try {
      await api(`/api/tasks/${task.id}/review`, { body: { decision, feedback: feedback || undefined, version: task.version } });
      toast.success(decision === "APPROVED" ? "Approved 🎉" : "Changes requested", { description: "The assignee has been notified." });
      onClose();
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Review failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={`Review ${taskRef(task.number)}`} subtitle={task.title}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant={needsReason ? "danger" : "success"} loading={busy} disabled={needsReason && feedback.trim().length < 5} onClick={send}>{needsReason ? "Request changes" : "Approve"}</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {(["APPROVED", "CHANGES_REQUESTED"] as const).map((d) => (
            <button key={d} onClick={() => setDecision(d)}
              className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition ${decision === d ? (d === "APPROVED" ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-200" : "border-orange-500/60 bg-orange-500/15 text-orange-200") : "border-line text-muted hover:text-fg"}`}>
              {d === "APPROVED" ? <CheckCircle2 className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
              {d === "APPROVED" ? "Approve" : "Request changes"}
            </button>
          ))}
        </div>
        <Field label={needsReason ? "What needs to change? (required)" : "Feedback (optional)"} error={needsReason && feedback.length > 0 && feedback.trim().length < 5 ? "Please be specific so it can be fixed." : undefined}>
          <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder={needsReason ? "Be specific: what, where, and why." : "Great work because…"} />
        </Field>
      </div>
    </Modal>
  );
}

// ───────────────────────── Status change with reason ─────────────────────────

export function ReasonDialog({ open, title, onClose, onSubmit, required = true }: { open: boolean; title: string; onClose: () => void; onSubmit: (reason: string) => Promise<void>; required?: boolean }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setReason(""); }, [open]);
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={required && !reason.trim()} onClick={async () => { setBusy(true); try { await onSubmit(reason); onClose(); } finally { setBusy(false); } }}>Confirm</Button></>}>
      <Field label={required ? "Reason (required)" : "Note (optional)"}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Shared with the team on the task" /></Field>
    </Modal>
  );
}

// ───────────────────────── Schedule picker ─────────────────────────

export function ScheduleDialog({ task, open, onClose, onDone }: { task: (MiniTask & { scheduledEnd: string | null; estimateMinutes: number | null }) | null; open: boolean; onClose: () => void; onDone: () => void }) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  useEffect(() => {
    if (!open || !task) return;
    const s = task.scheduledStart ? new Date(task.scheduledStart) : (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d; })();
    const e = task.scheduledEnd ? new Date(task.scheduledEnd) : new Date(s.getTime() + (task.estimateMinutes || 120) * 60_000);
    setStart(toLocalInput(s)); setEnd(toLocalInput(e));
  }, [open, task]);
  if (!task) return null;
  const save = async (slot?: { start: string; end: string }, clear?: boolean) => {
    setBusy(true);
    try {
      await api(`/api/tasks/${task.id}/schedule`, { body: clear ? { start: null, end: null, version: task.version } : { start: slot?.start ?? fromLocalInput(start), end: slot?.end ?? fromLocalInput(end), version: task.version } });
      toast.success(clear ? "Removed from the schedule" : "Scheduled");
      onClose();
      onDone();
    } catch (e) {
      if (isConflict(e)) setConflict({ message: e.message, details: e.details, onPick: (s) => save(s) });
      else toast.error(e instanceof Error ? e.message : "Could not schedule");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Modal open={open} onClose={onClose} size="sm" title={`Schedule ${taskRef(task.number)}`} subtitle="Availability is checked against working hours, leave and other bookings."
        footer={<>{task.scheduledStart && <Button variant="ghost" onClick={() => save(undefined, true)}><Trash2 className="h-4 w-4" /> Unschedule</Button>}<Button variant="primary" loading={busy} onClick={() => save()}>Save</Button></>}>
        <div className="grid gap-4">
          <Field label="Start"><Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="End"><Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
      </Modal>
      <ConflictDialog state={conflict} onClose={() => setConflict(null)} />
    </>
  );
}
