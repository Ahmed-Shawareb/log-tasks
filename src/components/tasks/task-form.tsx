"use client";
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { ChevronDown, Minus, PenSquare, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PRIORITIES, PRIORITY_META } from "@/lib/constants";
import { api, fromLocalInput, toLocalInput } from "@/lib/client";
import { cn, taskRef } from "@/lib/utils";
import type { TaskFull } from "@/lib/types";
import { Button, Field, Input, Modal, Select, Textarea } from "../ui";
import { useApp } from "../app-context";
import { AssigneeSelect, useProjects } from "./pickers";
import { TypeIcon, qtyLabel, useTaskTypes, type TaskTypeOpt } from "./task-types";

function QuantityStepper({ value, onChange, unit }: { value: number; onChange: (n: number) => void; unit: string }) {
  return (
    <div className="flex items-center gap-3">
      <Button type="button" size="icon" onClick={() => onChange(Math.max(1, value - 1))} aria-label="Less"><Minus className="h-4 w-4" /></Button>
      <Input type="number" min={1} max={100000} value={value} onChange={(e) => onChange(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
        className="h-12 w-28 text-center font-display text-2xl font-bold" aria-label={`How many ${unit}`} />
      <Button type="button" size="icon" onClick={() => onChange(value + 1)} aria-label="More"><Plus className="h-4 w-4" /></Button>
      <span className="text-sm text-muted">{unit}</span>
    </div>
  );
}

export function PrioritySegment({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-4 gap-1 rounded-xl border border-line bg-panel p-1" role="radiogroup" aria-label="Priority">
      {PRIORITIES.map((p) => (
        <button key={p} type="button" role="radio" aria-checked={value === p} onClick={() => onChange(p)}
          className={cn("rounded-lg py-1.5 text-xs font-medium transition", value === p ? "text-white" : "text-muted hover:text-fg")}
          style={value === p ? { background: PRIORITY_META[p].color } : undefined}>
          {PRIORITY_META[p].label}
        </button>
      ))}
    </div>
  );
}

const empty = { typeId: "", quantity: 10, title: "", description: "", projectId: "", assigneeId: "", priority: "MEDIUM", dueAt: "", startDate: "", checklist: "" };

/** One form for everyone. Creates exactly one task; splitting it between people happens afterwards ("Split"). */
export function TaskFormModal() {
  const { createDefaults, closeCreate, user, invalidate, openTask } = useApp();
  const open = createDefaults !== null;
  const types = useTaskTypes();
  const projects = useProjects();
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [f, setF] = useState(empty);
  const type: TaskTypeOpt | undefined = useMemo(() => types.find((t) => t.id === f.typeId), [types, f.typeId]);

  useEffect(() => {
    if (!open) return;
    setMore(false);
    setF({ ...empty, title: createDefaults?.title ?? "", projectId: createDefaults?.projectId ?? "", assigneeId: createDefaults?.assigneeId ?? "", dueAt: createDefaults?.dueAt ? toLocalInput(createDefaults.dueAt) : "" });
  }, [open, createDefaults]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const autoTitle = type ? (type.unit ? qtyLabel(type, f.quantity) : type.name) : "";
  const isSubtask = !!createDefaults?.parentId;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const t = await api<{ id: string; number: number }>("/api/tasks", {
        body: {
          typeId: f.typeId || null, quantity: type?.unit ? f.quantity : null, title: f.title || null,
          description: f.description || null, projectId: f.projectId || null, parentId: createDefaults?.parentId || null,
          assigneeId: f.assigneeId || null, priority: f.priority, dueAt: fromLocalInput(f.dueAt), startDate: fromLocalInput(f.startDate),
          checklist: f.checklist.split("\n").map((l) => l.trim()).filter(Boolean),
        },
      });
      toast.success(`Created ${taskRef(t.number)}`, { action: { label: "Open", onClick: () => openTask(t.id) } });
      closeCreate();
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create task");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={closeCreate} size="lg"
      title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-accent-2" /> {isSubtask ? "New subtask" : "New task"}</span>}
      footer={<><Button variant="ghost" onClick={closeCreate}>Cancel</Button><Button variant="primary" form="task-form" loading={busy} type="submit">Create task</Button></>}>
      <form id="task-form" onSubmit={submit} className="space-y-5">
        {!isSubtask && (
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">What is needed?</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {types.map((t, i) => (
                <motion.button key={t.id} type="button" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                  onClick={() => setF((x) => ({ ...x, typeId: x.typeId === t.id ? "" : t.id }))}
                  className={cn("flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition",
                    f.typeId === t.id ? "border-transparent text-white shadow-glow" : "border-line bg-panel text-fg-2 hover:border-line-strong")}
                  style={f.typeId === t.id ? { background: `linear-gradient(135deg, ${t.color}, color-mix(in srgb, ${t.color} 60%, #000))` } : undefined}>
                  <TypeIcon icon={t.icon} className="h-4 w-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{t.name}</span>
                    {!!t.stages?.length && <span className={cn("block truncate text-[11px]", f.typeId === t.id ? "text-white/80" : "text-muted")}>{t.stages.join(" → ")}</span>}
                  </span>
                </motion.button>
              ))}
              <button type="button" onClick={() => setF((x) => ({ ...x, typeId: "" }))}
                className={cn("flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium transition", !f.typeId ? "border-accent/60 bg-accent-soft text-fg" : "border-dashed border-line-strong text-muted hover:text-fg")}>
                <PenSquare className="h-4 w-4" /> Custom task
              </button>
            </div>
          </div>
        )}

        {type?.unit && (
          <Field label={`How many ${type.unitPlural}?`}>
            <QuantityStepper value={f.quantity} onChange={(n) => setF((x) => ({ ...x, quantity: n }))} unit={type.unitPlural ?? ""} />
          </Field>
        )}

        <Field label={type ? "Title (optional)" : "Title"}>
          <Input required={!type} minLength={type ? 0 : 2} maxLength={200} value={f.title} onChange={set("title")} placeholder={autoTitle || "e.g. Launch campaign for Nile Bites"} />
        </Field>

        <div className="grid gap-4 md:grid-cols-2">
          {!isSubtask && projects.length > 0 && (
            <Field label="Client / project">
              <Select value={f.projectId} onChange={set("projectId")}>
                <option value="">No project</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.client.name} · {p.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label={user.role === "ADMIN" ? "Send to" : "Assign to"} hint={user.role === "ADMIN" ? "An account manager, a team manager, or straight to an employee." : undefined}>
            <AssigneeSelect department={null} value={f.assigneeId} onChange={(v) => setF((x) => ({ ...x, assigneeId: v }))} allowNone />
          </Field>
          <Field label="Deadline"><Input type="datetime-local" value={f.dueAt} onChange={set("dueAt")} /></Field>
          <Field label="Priority"><PrioritySegment value={f.priority} onChange={(v) => setF((x) => ({ ...x, priority: v }))} /></Field>
        </div>

        <Field label="Notes for the team"><Textarea value={f.description} onChange={set("description")} placeholder="Brief, references, what the client expects…" className="min-h-[80px]" /></Field>

        <button type="button" onClick={() => setMore((m) => !m)} className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
          <ChevronDown className={cn("h-3.5 w-3.5 transition", more && "rotate-180")} /> More options
        </button>
        {more && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Start"><Input type="datetime-local" value={f.startDate} onChange={set("startDate")} /></Field>
            <Field label="Checklist" hint="One item per line"><Textarea value={f.checklist} onChange={set("checklist")} className="min-h-[70px]" /></Field>
          </div>
        )}
      </form>
    </Modal>
  );
}

export function EditTaskModal({ task, open, onClose, onDone }: { task: TaskFull; open: boolean; onClose: () => void; onDone: () => void }) {
  const projects = useProjects();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ title: "", description: "", projectId: "", priority: "MEDIUM", dueAt: "", quantity: 1 });
  useEffect(() => {
    if (!open) return;
    setF({ title: task.title, description: task.description ?? "", projectId: task.projectId ?? "", priority: task.priority, dueAt: toLocalInput(task.dueAt), quantity: task.quantity ?? 1 });
  }, [open, task]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: {
          version: task.version, title: f.title, description: f.description || null, projectId: f.projectId || null, priority: f.priority,
          dueAt: fromLocalInput(f.dueAt), ...(task.quantity !== null ? { quantity: Number(f.quantity) } : {}),
        },
      });
      toast.success("Task updated");
      onClose();
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" title={`Edit ${taskRef(task.number)}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" form="edit-task" type="submit" loading={busy}>Save changes</Button></>}>
      <form id="edit-task" onSubmit={save} className="grid gap-4 md:grid-cols-2">
        <Field label="Title" className="md:col-span-2"><Input required value={f.title} onChange={set("title")} /></Field>
        {task.quantity !== null && task.type && (
          <Field label={`Total ${task.type.unitPlural}`} hint={task.allocated ? `${task.allocated} already given out` : undefined}>
            <QuantityStepper value={Number(f.quantity)} onChange={(n) => setF((x) => ({ ...x, quantity: n }))} unit={task.type.unitPlural ?? ""} />
          </Field>
        )}
        <Field label="Deadline"><Input type="datetime-local" value={f.dueAt} onChange={set("dueAt")} /></Field>
        <Field label="Priority"><PrioritySegment value={f.priority} onChange={(v) => setF((x) => ({ ...x, priority: v }))} /></Field>
        <Field label="Client / project">
          <Select value={f.projectId} onChange={set("projectId")}>
            <option value="">No project</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.client.name} · {p.name}</option>)}
          </Select>
        </Field>
        <Field label="Notes" className="md:col-span-2"><Textarea value={f.description} onChange={set("description")} className="min-h-[120px]" /></Field>
      </form>
    </Modal>
  );
}
