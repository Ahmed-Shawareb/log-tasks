"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PRIORITIES, PRIORITY_META, PROJECT_STATUSES, humanize } from "@/lib/constants";
import { api } from "@/lib/client";
import type { Person } from "@/lib/types";
import { useApp } from "@/components/app-context";
import { ColorSwatches } from "@/components/forms";
import { Button, Field, Input, Modal, Select, Textarea } from "@/components/ui";

export type ProjectInput = {
  id?: string; name: string; clientId: string; description: string | null; requirements: string | null; notes: string | null;
  accountManagerId: string | null; status: string; priority: string; color: string; startDate: string | null; targetDate: string | null;
};

const day = (d: string | null | undefined) => (d ? d.slice(0, 10) : "");

export function ProjectFormModal({ open, onClose, onSaved, project, defaultClientId }: {
  open: boolean; onClose: () => void; onSaved: (p: { id: string }) => void; project?: ProjectInput | null; defaultClientId?: string;
}) {
  const { isAdmin, user } = useApp();
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [ams, setAms] = useState<Person[]>([]);
  const [busy, setBusy] = useState(false);
  const empty: ProjectInput = { name: "", clientId: defaultClientId ?? "", description: "", requirements: "", notes: "", accountManagerId: isAdmin ? "" : user.id, status: "PLANNING", priority: "MEDIUM", color: "#8b5cf6", startDate: "", targetDate: "" };
  const [f, setF] = useState<ProjectInput>(empty);

  useEffect(() => {
    if (!open) return;
    setF(project ? { ...project, startDate: day(project.startDate), targetDate: day(project.targetDate) } : empty);
    api<{ id: string; name: string }[]>("/api/clients").then(setClients).catch(() => {});
    if (isAdmin) api<Person[]>("/api/users").then((u) => setAms(u.filter((p) => p.role === "ACCOUNT_MANAGER" || p.role === "ADMIN"))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project]);

  const set = (k: keyof ProjectInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const body: Record<string, unknown> = {
      name: f.name, clientId: f.clientId, description: f.description || null, requirements: f.requirements || null, notes: f.notes || null,
      status: f.status, priority: f.priority, color: f.color, startDate: f.startDate || null, targetDate: f.targetDate || null,
    };
    if (isAdmin) body.accountManagerId = f.accountManagerId || null;
    try {
      const p = project?.id
        ? await api<{ id: string }>(`/api/projects/${project.id}`, { method: "PATCH", body })
        : await api<{ id: string }>("/api/projects", { body });
      toast.success(project?.id ? "Project updated" : "Project created");
      onSaved(p);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save project");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" title={project?.id ? "Edit project" : "New project"} subtitle="Capture the client’s requirements here so every task can refer back to them."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="project-form" loading={busy}>{project?.id ? "Save" : "Create project"}</Button></>}>
      <form id="project-form" onSubmit={save} className="grid gap-4 md:grid-cols-2">
        <Field label="Project name" className="md:col-span-2"><Input required minLength={2} value={f.name} onChange={set("name")} placeholder="e.g. Ramadan Social Campaign" /></Field>
        <Field label="Client">
          <Select required value={f.clientId} onChange={set("clientId")} disabled={!!project?.id}>
            <option value="" disabled>Choose client</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        {isAdmin ? (
          <Field label="Account manager">
            <Select value={f.accountManagerId ?? ""} onChange={set("accountManagerId")}>
              <option value="">Client’s account manager</option>
              {ams.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
        ) : <Field label="Account manager"><Input disabled value={user.name} /></Field>}
        <Field label="Status"><Select value={f.status} onChange={set("status")}>{PROJECT_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select></Field>
        <Field label="Priority"><Select value={f.priority} onChange={set("priority")}>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}</Select></Field>
        <Field label="Start date"><Input type="date" value={f.startDate ?? ""} onChange={set("startDate")} /></Field>
        <Field label="Target completion"><Input type="date" value={f.targetDate ?? ""} onChange={set("targetDate")} /></Field>
        <Field label="Color" className="md:col-span-2"><ColorSwatches value={f.color} onChange={(c) => setF((x) => ({ ...x, color: c }))} /></Field>
        <Field label="Description" className="md:col-span-2"><Textarea value={f.description ?? ""} onChange={set("description")} /></Field>
        <Field label="Client requirements" className="md:col-span-2"><Textarea value={f.requirements ?? ""} onChange={set("requirements")} className="min-h-[120px]" placeholder={"- Deliverables\n- Budget\n- Reporting cadence"} /></Field>
        <Field label="Internal notes" className="md:col-span-2"><Textarea value={f.notes ?? ""} onChange={set("notes")} /></Field>
      </form>
    </Modal>
  );
}
