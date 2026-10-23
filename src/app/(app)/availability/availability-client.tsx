"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, CalendarOff, Clock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { LEAVE_TYPES, WEEKDAYS, humanize } from "@/lib/constants";
import { api, fmtDateTime, fromLocalInput } from "@/lib/client";
import { formatMinutes, taskRef } from "@/lib/utils";
import type { Person } from "@/lib/types";
import { useApp } from "@/components/app-context";
import { minToTime, useFetch } from "@/components/forms";
import { Avatar, Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, Field, Input, Modal, PageHeader, Select, Skeleton, Textarea } from "@/components/ui";

type Leave = { id: string; userId: string; type: string; startsAt: string; endsAt: string; note: string | null; createdById: string | null; user: { id: string; name: string; avatarColor: string } };
const LEAVE_COLOR: Record<string, string> = { VACATION: "#38bdf8", SICK: "#f97316", UNAVAILABLE: "#94a3b8", OTHER: "#a855f7" };

export function AvailabilityClient() {
  const { user, isManager, dataVersion, openTask } = useApp();
  const [showPast, setShowPast] = useState(false);
  // Day granularity keeps the URL stable between renders (no refetch loop).
  const from = new Date(Date.now() - (showPast ? 90 : 0) * 864e5).toISOString().slice(0, 10);
  const leaves = useFetch<Leave[]>(`/api/leaves?from=${from}`, [dataVersion]);
  const me = useFetch<{ user: Person }>("/api/me");
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Leave | null>(null);
  const [busy, setBusy] = useState(false);
  const [clashes, setClashes] = useState<{ id: string; number: number; title: string }[]>([]);
  const canDelete = (l: Leave) => user.role === "ADMIN" || l.userId === user.id || l.createdById === user.id;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Agency" title="Availability" subtitle="Leave and unavailability are checked before anyone is scheduled."
        actions={<Button variant="primary" size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Record leave</Button>} />

      {clashes.length > 0 && (
        <Card className="border-amber-500/40 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-fg">{clashes.length} booked task{clashes.length > 1 ? "s" : ""} overlap this leave</div>
              <p className="text-xs text-muted">Reschedule or hand them off so the work is not stranded.</p>
              <ul className="mt-2 space-y-1">
                {clashes.map((t) => <li key={t.id}><button onClick={() => openTask(t.id)} className="text-sm text-accent-2 hover:underline">{taskRef(t.number)} · {t.title}</button></li>)}
              </ul>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setClashes([])}>Dismiss</Button>
          </div>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={showPast ? "Leave (last 90 days and upcoming)" : "Upcoming & current leave"} icon={<CalendarOff className="h-4 w-4" />}
            action={<button className="text-xs text-accent-2 hover:underline" onClick={() => setShowPast((s) => !s)}>{showPast ? "Hide past" : "Show past"}</button>} />
          {!leaves.data && !leaves.error && <div className="space-y-2 p-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>}
          {leaves.error && <p className="px-5 py-4 text-sm text-danger">{leaves.error}</p>}
          {leaves.data?.length === 0 && <EmptyState icon={<CalendarOff className="h-6 w-6" />} title="No leave recorded" body="Everyone in your scope is available." />}
          <ul className="divide-y divide-[var(--line)]">
            {leaves.data?.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <Avatar name={l.user.name} color={l.user.avatarColor} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="text-fg">{l.user.name}</div>
                  <div className="text-xs text-muted">{fmtDateTime(l.startsAt)} → {fmtDateTime(l.endsAt)}{l.note ? ` · ${l.note}` : ""}</div>
                </div>
                <Badge color={LEAVE_COLOR[l.type]}>{humanize(l.type)}</Badge>
                {canDelete(l) && <Button size="icon" variant="ghost" aria-label="Delete leave" onClick={() => setDeleting(l)}><Trash2 className="h-4 w-4" /></Button>}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="My working hours" subtitle="Set by an administrator" icon={<Clock className="h-4 w-4" />} />
          {!me.data ? <div className="p-5"><Skeleton className="h-20" /></div> : (
            <div className="space-y-4 px-5 py-4">
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((d) => <span key={d.iso} className={`rounded-lg border px-2.5 py-1 text-xs ${me.data!.user.workDays.includes(d.iso) ? "border-accent/50 bg-accent-soft text-fg" : "border-line text-muted line-through"}`}>{d.short}</span>)}
              </div>
              <div className="text-sm text-fg-2">{minToTime(me.data.user.workStartMin)} – {minToTime(me.data.user.workEndMin)} <span className="text-muted">(company time)</span></div>
              <div className="text-sm text-fg-2">Weekly capacity: <strong className="text-fg">{formatMinutes(me.data.user.weeklyCapacityMin)}</strong></div>
            </div>
          )}
        </Card>
      </div>

      <LeaveModal open={adding} onClose={() => setAdding(false)} canPickPerson={isManager} selfId={user.id}
        onSaved={(c) => { setClashes(c); leaves.reload(); }} />
      <ConfirmDialog open={!!deleting} danger title="Delete leave record?" confirmLabel="Delete" loading={busy}
        body={deleting && <>Remove {humanize(deleting.type).toLowerCase()} leave for <strong>{deleting.user.name}</strong>? They will become schedulable for that time again.</>}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          setBusy(true);
          try { await api(`/api/leaves/${deleting.id}`, { method: "DELETE" }); toast.success("Leave removed"); setDeleting(null); leaves.reload(); }
          catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); }
          finally { setBusy(false); }
        }} />
    </div>
  );
}

function LeaveModal({ open, onClose, onSaved, canPickPerson, selfId }: { open: boolean; onClose: () => void; onSaved: (clashes: { id: string; number: number; title: string }[]) => void; canPickPerson: boolean; selfId: string }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [f, setF] = useState({ userId: selfId, type: "VACATION", startsAt: "", endsAt: "", note: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0);
    const e = new Date(d); e.setDate(e.getDate() + 1);
    const local = (x: Date) => new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setF({ userId: selfId, type: "VACATION", startsAt: local(d), endsAt: local(e), note: "" });
    if (canPickPerson) api<Person[]>("/api/users").then(setPeople).catch(() => {});
  }, [open, canPickPerson, selfId]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ clashes: { id: string; number: number; title: string }[] }>("/api/leaves", {
        body: { userId: f.userId, type: f.type, startsAt: fromLocalInput(f.startsAt), endsAt: fromLocalInput(f.endsAt), note: f.note || null },
      });
      toast.success("Leave recorded", { description: r.clashes.length ? `${r.clashes.length} booked task(s) overlap — review them.` : undefined });
      onSaved(r.clashes);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not record leave");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Record leave or unavailability" size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="leave-form" loading={busy}>Save</Button></>}>
      <form id="leave-form" onSubmit={save} className="grid gap-4">
        {canPickPerson && (
          <Field label="Person">
            <Select value={f.userId} onChange={(e) => setF((x) => ({ ...x, userId: e.target.value }))}>
              {people.length === 0 && <option value={selfId}>Me</option>}
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Type"><Select value={f.type} onChange={(e) => setF((x) => ({ ...x, type: e.target.value }))}>{LEAVE_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}</Select></Field>
        <Field label="From"><Input type="datetime-local" required value={f.startsAt} onChange={(e) => setF((x) => ({ ...x, startsAt: e.target.value }))} /></Field>
        <Field label="Until"><Input type="datetime-local" required value={f.endsAt} onChange={(e) => setF((x) => ({ ...x, endsAt: e.target.value }))} /></Field>
        <Field label="Note"><Textarea value={f.note} onChange={(e) => setF((x) => ({ ...x, note: e.target.value }))} className="min-h-[60px]" /></Field>
      </form>
    </Modal>
  );
}
