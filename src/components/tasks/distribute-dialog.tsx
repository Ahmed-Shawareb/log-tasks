"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Plus, Split, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, fromLocalInput, toLocalInput } from "@/lib/client";
import { cn, taskRef } from "@/lib/utils";
import { Avatar, Button, Field, Input, Modal, Progress } from "../ui";
import { AssigneeSelect, useEligible } from "./pickers";
import { qtyLabel, stepColor } from "./task-types";

export type DistributableTask = {
  id: string; number: number; title: string; quantity: number | null; remaining: number | null; dueAt: string | null;
  stage?: number | null; stageRemaining?: number[] | null;
  type: { unit: string | null; unitPlural: string | null; stages?: string[] } | null;
};

type Row = { assigneeId: string; quantity: number; dueAt: string; note: string };

/** Steps of a main staged task ("30 videos": Script writing → Filming → Editing); empty for everything else. */
export const stepsOf = (t: { stage?: number | null; quantity: number | null; type: { stages?: string[] } | null }) =>
  t.stage === null || t.stage === undefined ? (t.quantity !== null ? t.type?.stages ?? [] : []) : [];

/**
 * Give a task (or part of it) to people. For countable tasks ("60 videos") each person gets a number; for staged
 * tasks you also pick the step. The server refuses anything above what is left, or a step planned before the one it needs.
 */
export function DistributeDialog({ task, open, personId, stage, dueAt, onClose, onDone }: {
  task: DistributableTask | null; open: boolean; personId?: string | null; stage?: number | null; dueAt?: string | null; onClose: () => void; onDone: () => void;
}) {
  const { people } = useEligible(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [mode, setMode] = useState<"all" | "some">("all");
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const counted = task?.quantity !== null && task?.quantity !== undefined;
  const steps = task ? stepsOf(task) : [];
  const staged = counted && steps.length > 0;
  const leftFor = (k: number) => (staged ? task?.stageRemaining?.[k] ?? 0 : task?.remaining ?? 0);
  const remaining = leftFor(step);

  useEffect(() => {
    if (!open || !task) return;
    const s = stepsOf(task);
    const first = stage ?? Math.max(0, s.findIndex((_, k) => (task.stageRemaining?.[k] ?? 0) > 0));
    const left = s.length ? task.stageRemaining?.[first] ?? 0 : task.remaining ?? 0;
    setStep(first);
    setMode("all");
    setError(null);
    setRows([{ assigneeId: personId ?? "", quantity: Math.max(1, left), dueAt: toLocalInput(dueAt ?? task.dueAt), note: "" }]);
  }, [open, task, personId, stage, dueAt]);

  if (!task) return null;
  const single = !!personId && rows.length === 1;
  const effective = rows.map((r) => ({ ...r, quantity: single && mode === "all" ? remaining : r.quantity }));
  const total = effective.reduce((s, r) => s + (r.quantity || 0), 0);
  const over = counted && total > remaining;
  const person = people.find((p) => p.id === rows[0]?.assigneeId);
  const setRow = (i: number, patch: Partial<Row>) => { setError(null); setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r))); };
  const stepName = staged ? steps[step] : task.stage !== null && task.stage !== undefined ? task.type?.stages?.[task.stage] : undefined;
  const unitWord = task.type?.unitPlural ?? "items";

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ remaining: number | null }>(`/api/tasks/${task.id}/distribute`, {
        body: { allocations: effective.map((x) => ({ assigneeId: x.assigneeId, quantity: counted ? x.quantity : null, stage: staged ? step : undefined, dueAt: fromLocalInput(x.dueAt), note: x.note || null })) },
      });
      toast.success(counted ? `Given out ${qtyLabel(task.type, total)}${stepName ? ` · ${stepName}` : ""}` : "Task given out", { description: counted ? `${qtyLabel(task.type, r.remaining ?? 0)} left${stepName ? ` for ${stepName.toLowerCase()}` : ""}` : undefined });
      onClose();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not split the task");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg"
      title={<span className="flex items-center gap-2"><Split className="h-4 w-4 text-accent-2" /> {single && person ? `Give to ${person.name}` : `Split ${taskRef(task.number)}`}</span>}
      subtitle={task.title}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={over || (total === 0 && counted) || effective.some((r) => !r.assigneeId)} onClick={send}>Confirm</Button></>}>
      <div className="space-y-5">
        {staged && (
          <div>
            <div className="mb-2 text-sm font-medium text-fg">Which step?</div>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
              {steps.map((s, k) => {
                const left = leftFor(k), c = stepColor(s, k);
                return (
                  <button key={s} type="button" disabled={!left} onClick={() => { setStep(k); setError(null); setRows((rs) => rs.map((r) => ({ ...r, quantity: Math.min(r.quantity, Math.max(1, left)) }))); }}
                    className={cn("rounded-xl border p-2.5 text-left text-xs transition disabled:opacity-40", step === k ? "border-transparent text-white shadow-glow" : "border-line text-muted hover:text-fg")}
                    style={step === k ? { background: `linear-gradient(135deg, ${c}, color-mix(in srgb, ${c} 60%, #000))` } : undefined}>
                    <div className="text-[10px] opacity-80">Step {k + 1}</div>
                    <div className="truncate text-sm font-semibold">{s}</div>
                    <div className="opacity-80">{left ? `${left} left` : "All given out"}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {counted && (
          <div className="rounded-2xl border border-line bg-panel p-4">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted">Left to give out{stepName ? ` · ${stepName}` : ""}</span>
              <span className={cn("font-display text-2xl font-bold", over ? "text-red-400" : "text-fg")}>{qtyLabel(task.type, Math.max(0, remaining - total))}</span>
            </div>
            <Progress className="mt-2" value={task.quantity ? ((task.quantity - remaining + total) / task.quantity) * 100 : 0} color={over ? "#ef4444" : stepName ? stepColor(stepName, step) : undefined} />
            <div className="mt-1 text-[11px] text-muted">{qtyLabel(task.type, task.quantity)} in total · {qtyLabel(task.type, task.quantity! - remaining)} already given out</div>
          </div>
        )}

        {single && counted ? (
          <div className="space-y-3">
            <div className="text-sm font-medium text-fg">How many {unitWord}{stepName ? ` (${stepName.toLowerCase()})` : ""} for {person?.name ?? "this person"}?</div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => { setMode("all"); setError(null); }} className={cn("rounded-xl border p-3 text-left text-sm transition", mode === "all" ? "border-accent bg-accent-soft text-fg" : "border-line text-muted hover:text-fg")}>
                <div className="font-semibold">All of them</div><div className="text-xs">{qtyLabel(task.type, remaining)}</div>
              </button>
              <button type="button" onClick={() => { setMode("some"); setError(null); }} className={cn("rounded-xl border p-3 text-left text-sm transition", mode === "some" ? "border-accent bg-accent-soft text-fg" : "border-line text-muted hover:text-fg")}>
                <div className="font-semibold">A specific number</div><div className="text-xs">Keep the rest for others</div>
              </button>
            </div>
            {mode === "some" && (
              <Input type="number" min={1} max={remaining} value={rows[0]?.quantity ?? 1} autoFocus onChange={(e) => setRow(0, { quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                className="h-12 w-32 text-center font-display text-2xl font-bold" aria-label="Quantity" />
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={stepName ? `${stepName} due` : "Deadline"}><Input type="datetime-local" value={rows[0]?.dueAt ?? ""} onChange={(e) => setRow(0, { dueAt: e.target.value })} /></Field>
              <Field label="Note (optional)"><Input value={rows[0]?.note ?? ""} onChange={(e) => setRow(0, { note: e.target.value })} placeholder="Anything they should know" /></Field>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {rows.map((r, i) => (
                <motion.div key={i} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
                  className="grid items-end gap-2 rounded-xl border border-line bg-panel p-3 sm:grid-cols-[1fr_110px_190px_auto]">
                  <Field label="Person"><AssigneeSelect department={null} value={r.assigneeId} onChange={(v) => setRow(i, { assigneeId: v })} allowNone={false} /></Field>
                  {counted ? <Field label={unitWord}><Input type="number" min={1} value={r.quantity} onChange={(e) => setRow(i, { quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} /></Field> : <div />}
                  <Field label="Deadline"><Input type="datetime-local" value={r.dueAt} onChange={(e) => setRow(i, { dueAt: e.target.value })} /></Field>
                  <Button variant="ghost" size="icon" disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label="Remove person"><Trash2 className="h-4 w-4" /></Button>
                </motion.div>
              ))}
            </AnimatePresence>
            <Button variant="ghost" size="sm" onClick={() => setRows((rs) => [...rs, { assigneeId: "", quantity: counted ? Math.max(1, remaining - total) : 1, dueAt: toLocalInput(dueAt ?? task.dueAt), note: "" }])}>
              <Plus className="h-3.5 w-3.5" /> Add person
            </Button>
          </div>
        )}
        {over && <p className="text-sm text-red-400">That is more than what is left ({qtyLabel(task.type, remaining)}).</p>}
        {error && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} role="alert" className="flex gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{error}</span>
          </motion.div>
        )}
        {person && single && <div className="flex items-center gap-2 text-xs text-muted"><Avatar name={person.name} color={person.avatarColor} size={20} /> {person.title ?? person.department?.name}</div>}
      </div>
    </Modal>
  );
}
