"use client";
import { useEffect, useState } from "react";
import { LayoutTemplate, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { DEPARTMENTS, MANAGER_DEPARTMENT, PRIORITIES, PRIORITY_META } from "@/lib/constants";
import { api, fromLocalInput, toLocalInput } from "@/lib/client";
import { taskRef } from "@/lib/utils";
import type { TaskFull } from "@/lib/types";
import { Button, Field, Input, Modal, Select, Textarea } from "../ui";
import { useApp } from "../app-context";
import { AssigneeSelect, useEligible, useProjects } from "./pickers";

type Template = { id: string; name: string; description: string | null; department: { key: string } | null; blueprint: { checklist?: string[]; subtasks?: { title: string }[] } };

export function TaskFormModal() {
  const { createDefaults, closeCreate, user, invalidate, openTask } = useApp();
  const open = createDefaults !== null;
  const forcedDept = MANAGER_DEPARTMENT[user.role] ?? null;
  const projects = useProjects();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    title: "", description: "", projectId: "", department: "", assigneeId: "", reviewerId: "", priority: "MEDIUM",
    startDate: "", dueAt: "", estimate: "", labels: "", checklist: "", templateId: "", parentId: "",
  });
  const managers = useEligible(null).people.filter((p) => p.role !== "EMPLOYEE");

  useEffect(() => {
    if (!open) return;
    setF({
      title: createDefaults?.title ?? "", description: "", projectId: createDefaults?.projectId ?? "", department: createDefaults?.department ?? forcedDept ?? "",
      assigneeId: createDefaults?.assigneeId ?? "", reviewerId: "", priority: "MEDIUM", startDate: "", dueAt: createDefaults?.dueAt ? toLocalInput(createDefaults.dueAt) : "",
      estimate: "", labels: "", checklist: "", templateId: createDefaults?.templateId ?? "", parentId: createDefaults?.parentId ?? "",
    });
    api<Template[]>("/api/templates").then(setTemplates).catch(() => {});
  }, [open, createDefaults, forcedDept]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const tpl = templates.find((t) => t.id === f.templateId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const t = await api<{ id: string; number: number }>("/api/tasks", {
        body: {
          title: f.title, description: f.description || null, projectId: f.projectId || null, parentId: f.parentId || null,
          department: f.department || null, assigneeId: f.assigneeId || null, reviewerId: f.reviewerId || null, priority: f.priority,
          startDate: fromLocalInput(f.startDate), dueAt: fromLocalInput(f.dueAt), estimateMinutes: f.estimate ? Math.round(Number(f.estimate) * 60) : null,
          labels: f.labels.split(",").map((l) => l.trim()).filter(Boolean), checklist: f.checklist.split("\n").map((l) => l.trim()).filter(Boolean),
          templateId: f.templateId || null,
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
    <Modal open={open} onClose={closeCreate} size="lg" title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-accent-2" /> {f.parentId ? "New subtask" : "New task"}</span>}
      subtitle="Assignees are limited to active people allowed to take work in the chosen department."
      footer={<><Button variant="ghost" onClick={closeCreate}>Cancel</Button><Button variant="primary" form="task-form" loading={busy} type="submit">Create task</Button></>}>
      <form id="task-form" onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        {templates.length > 0 && !f.parentId && (
          <Field label="Start from a template" className="md:col-span-2">
            <div className="relative">
              <LayoutTemplate className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Select className="pl-9" value={f.templateId} onChange={(e) => {
                const t = templates.find((x) => x.id === e.target.value);
                setF((x) => ({ ...x, templateId: e.target.value, title: x.title || t?.name || "", department: forcedDept ?? (x.department || t?.department?.key || "") }));
              }}>
                <option value="">Blank task</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </div>
            {tpl && <span className="mt-1 block text-xs text-muted">Adds {tpl.blueprint.subtasks?.length ?? 0} subtasks and {tpl.blueprint.checklist?.length ?? 0} checklist items.</span>}
          </Field>
        )}
        <Field label="Title" className="md:col-span-2"><Input required minLength={2} maxLength={200} value={f.title} onChange={set("title")} placeholder="e.g. Design 8 Ramadan feed posts" /></Field>
        <Field label="Description & requirements" className="md:col-span-2"><Textarea value={f.description} onChange={set("description")} placeholder="Brief, context, acceptance criteria…" /></Field>
        {!f.parentId && (
          <Field label="Project">
            <Select value={f.projectId} onChange={set("projectId")}>
              <option value="">No project (internal)</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.client.name} · {p.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Department">
          <Select value={f.department} onChange={(e) => setF((x) => ({ ...x, department: e.target.value, assigneeId: "" }))} disabled={!!forcedDept}>
            <option value="">— None —</option>
            {DEPARTMENTS.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}
          </Select>
        </Field>
        <Field label="Assignee"><AssigneeSelect department={f.department || null} value={f.assigneeId} onChange={(v) => setF((x) => ({ ...x, assigneeId: v }))} /></Field>
        <Field label="Reviewer" hint="Defaults to you">
          <Select value={f.reviewerId} onChange={set("reviewerId")}>
            <option value="">Me ({user.name})</option>
            {managers.filter((m) => m.id !== user.id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </Field>
        <Field label="Priority">
          <Select value={f.priority} onChange={set("priority")}>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}</Select>
        </Field>
        <Field label="Estimate (hours)"><Input type="number" min={0} step={0.25} value={f.estimate} onChange={set("estimate")} placeholder="2" /></Field>
        <Field label="Start"><Input type="datetime-local" value={f.startDate} onChange={set("startDate")} /></Field>
        <Field label="Deadline"><Input type="datetime-local" value={f.dueAt} onChange={set("dueAt")} /></Field>
        <Field label="Labels" hint="Comma separated" className="md:col-span-2"><Input value={f.labels} onChange={set("labels")} placeholder="meta, design, urgent-client" /></Field>
        <Field label="Checklist" hint="One item per line" className="md:col-span-2"><Textarea value={f.checklist} onChange={set("checklist")} placeholder={"Brief confirmed\nAssets received"} className="min-h-[70px]" /></Field>
      </form>
    </Modal>
  );
}

export function EditTaskModal({ task, open, onClose, onDone }: { task: TaskFull; open: boolean; onClose: () => void; onDone: () => void }) {
  const projects = useProjects();
  const { user } = useApp();
  const forcedDept = MANAGER_DEPARTMENT[user.role] ?? null;
  const managers = useEligible(null).people.filter((p) => p.role !== "EMPLOYEE");
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ title: "", description: "", projectId: "", department: "", reviewerId: "", priority: "MEDIUM", startDate: "", dueAt: "", estimate: "", labels: "" });
  useEffect(() => {
    if (!open) return;
    setF({
      title: task.title, description: task.description ?? "", projectId: task.projectId ?? "", department: task.department?.key ?? "", reviewerId: task.reviewerId ?? "",
      priority: task.priority, startDate: toLocalInput(task.startDate), dueAt: toLocalInput(task.dueAt), estimate: task.estimateMinutes ? String(task.estimateMinutes / 60) : "", labels: task.labels.join(", "),
    });
  }, [open, task]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: {
          version: task.version, title: f.title, description: f.description || null, projectId: f.projectId || null, department: f.department || null,
          reviewerId: f.reviewerId || null, priority: f.priority, startDate: fromLocalInput(f.startDate), dueAt: fromLocalInput(f.dueAt),
          estimateMinutes: f.estimate ? Math.round(Number(f.estimate) * 60) : null, labels: f.labels.split(",").map((l) => l.trim()).filter(Boolean),
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
        <Field label="Description" className="md:col-span-2"><Textarea value={f.description} onChange={set("description")} className="min-h-[140px]" /></Field>
        <Field label="Project">
          <Select value={f.projectId} onChange={set("projectId")}>
            <option value="">No project</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.client.name} · {p.name}</option>)}
          </Select>
        </Field>
        <Field label="Department">
          <Select value={f.department} onChange={set("department")} disabled={!!forcedDept}>
            <option value="">— None —</option>
            {DEPARTMENTS.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}
          </Select>
        </Field>
        <Field label="Reviewer">
          <Select value={f.reviewerId} onChange={set("reviewerId")}>
            <option value="">Responsible managers</option>
            {managers.filter((m) => m.id !== task.assigneeId).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </Field>
        <Field label="Priority"><Select value={f.priority} onChange={set("priority")}>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}</Select></Field>
        <Field label="Start"><Input type="datetime-local" value={f.startDate} onChange={set("startDate")} /></Field>
        <Field label="Deadline"><Input type="datetime-local" value={f.dueAt} onChange={set("dueAt")} /></Field>
        <Field label="Estimate (hours)"><Input type="number" min={0} step={0.25} value={f.estimate} onChange={set("estimate")} /></Field>
        <Field label="Labels"><Input value={f.labels} onChange={set("labels")} /></Field>
      </form>
    </Modal>
  );
}
