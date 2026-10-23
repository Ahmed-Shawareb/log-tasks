"use client";
import { useEffect, useState } from "react";
import { CheckSquare, GitBranch, LayoutTemplate, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { DEPARTMENTS, PRIORITIES, PRIORITY_META } from "@/lib/constants";
import { api } from "@/lib/client";
import { formatMinutes } from "@/lib/utils";
import { useApp } from "@/components/app-context";
import { useFetch } from "@/components/forms";
import { Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, PageHeader, PriorityBadge, Select, Skeleton, Stagger, StaggerItem, Textarea } from "@/components/ui";

type Sub = { title: string; departmentKey?: string; estimateMinutes?: number; offsetDays?: number };
type Template = {
  id: string; name: string; description: string | null; priority: string; department: { key: string; name: string; color: string } | null;
  blueprint: { checklist?: string[]; subtasks?: Sub[] };
};

export function TemplatesClient() {
  const { openCreate } = useApp();
  const { data, error, reload } = useFetch<Template[]>("/api/templates");
  const [editing, setEditing] = useState<Template | "new" | null>(null);
  const [deleting, setDeleting] = useState<Template | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Agency" title="Task templates" subtitle="Reusable blueprints for recurring deliverables. They add subtasks and checklists in one click."
        actions={<Button variant="primary" size="sm" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> New template</Button>} />
      {error && <p className="text-sm text-danger">{error}</p>}
      {!data && !error && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48" />)}</div>}
      {data?.length === 0 && <Card><EmptyState icon={<LayoutTemplate className="h-6 w-6" />} title="No templates yet" /></Card>}
      {data && data.length > 0 && (
        <Stagger className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((t) => (
            <StaggerItem key={t.id}>
              <Card hover className="flex h-full flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-semibold text-fg">{t.name}</h3>
                  <PriorityBadge priority={t.priority} />
                </div>
                {t.department && <div className="mt-1"><Badge color={t.department.color}>{t.department.name}</Badge></div>}
                {t.description && <p className="mt-2 text-xs text-muted">{t.description}</p>}
                <div className="mt-4 space-y-1.5 text-xs text-fg-2">
                  {(t.blueprint.subtasks ?? []).slice(0, 5).map((s, i) => <div key={i} className="flex items-center gap-2"><GitBranch className="h-3.5 w-3.5 text-accent-2" /><span className="truncate">{s.title}</span>{s.estimateMinutes ? <span className="ml-auto text-muted">{formatMinutes(s.estimateMinutes)}</span> : null}</div>)}
                  {(t.blueprint.subtasks?.length ?? 0) > 5 && <div className="text-muted">+{t.blueprint.subtasks!.length - 5} more</div>}
                </div>
                <div className="mt-2 flex items-center gap-1 text-xs text-muted"><CheckSquare className="h-3.5 w-3.5" /> {t.blueprint.checklist?.length ?? 0} checklist items</div>
                <div className="mt-auto flex gap-2 border-t border-line pt-3">
                  <Button size="sm" variant="primary" onClick={() => openCreate({ title: t.name, department: t.department?.key, templateId: t.id })}>Use</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(t)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(t)} aria-label={`Delete ${t.name}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
      )}
      <TemplateModal template={editing === "new" ? null : editing} open={editing !== null} onClose={() => setEditing(null)} onSaved={reload} />
      <ConfirmDialog open={!!deleting} danger title="Delete template?" confirmLabel="Delete" loading={busy}
        body={<>Delete <strong>{deleting?.name}</strong>? Tasks already created from it are not affected.</>}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          setBusy(true);
          try { await api(`/api/templates/${deleting.id}`, { method: "DELETE" }); toast.success("Template deleted"); setDeleting(null); reload(); }
          catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); }
          finally { setBusy(false); }
        }} />
    </div>
  );
}

type SubRow = { title: string; departmentKey: string; hours: string; offsetDays: string };

function TemplateModal({ template, open, onClose, onSaved }: { template: Template | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: "", description: "", department: "", priority: "MEDIUM", checklist: "" });
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF({
      name: template?.name ?? "", description: template?.description ?? "", department: template?.department?.key ?? "",
      priority: template?.priority ?? "MEDIUM", checklist: (template?.blueprint.checklist ?? []).join("\n"),
    });
    setSubs((template?.blueprint.subtasks ?? []).map((s) => ({ title: s.title, departmentKey: s.departmentKey ?? "", hours: s.estimateMinutes ? String(s.estimateMinutes / 60) : "", offsetDays: s.offsetDays !== undefined ? String(s.offsetDays) : "" })));
  }, [open, template]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const body = {
      name: f.name, description: f.description || null, department: f.department || null, priority: f.priority,
      checklist: f.checklist.split("\n").map((l) => l.trim()).filter(Boolean),
      subtasks: subs.filter((s) => s.title.trim()).map((s) => ({
        title: s.title.trim(), departmentKey: s.departmentKey || undefined,
        estimateMinutes: s.hours ? Math.round(Number(s.hours) * 60) : undefined, offsetDays: s.offsetDays ? Number(s.offsetDays) : undefined,
      })),
    };
    try {
      if (template) await api(`/api/templates/${template.id}`, { method: "PATCH", body });
      else await api("/api/templates", { body });
      toast.success("Template saved");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save template");
    } finally {
      setBusy(false);
    }
  };
  const setSub = (i: number, k: keyof SubRow, v: string) => setSubs((x) => x.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  return (
    <Modal open={open} onClose={onClose} size="lg" title={template ? "Edit template" : "New template"}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="tpl-form" loading={busy}>Save</Button></>}>
      <form id="tpl-form" onSubmit={save} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Name" className="md:col-span-3"><Input required minLength={2} value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} /></Field>
          <Field label="Department">
            <Select value={f.department} onChange={(e) => setF((x) => ({ ...x, department: e.target.value }))}>
              <option value="">Any</option>{DEPARTMENTS.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}
            </Select>
          </Field>
          <Field label="Priority"><Select value={f.priority} onChange={(e) => setF((x) => ({ ...x, priority: e.target.value }))}>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}</Select></Field>
        </div>
        <Field label="Description"><Textarea value={f.description} onChange={(e) => setF((x) => ({ ...x, description: e.target.value }))} className="min-h-[60px]" /></Field>
        <Field label="Checklist" hint="One item per line"><Textarea value={f.checklist} onChange={(e) => setF((x) => ({ ...x, checklist: e.target.value }))} /></Field>
        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-wider text-muted">Subtasks</div>
          <p className="text-xs text-muted">“Days before deadline” sets each subtask’s deadline relative to the parent’s.</p>
          {subs.map((s, i) => (
            <div key={i} className="grid grid-cols-12 gap-2">
              <Input className="col-span-12 md:col-span-5" value={s.title} onChange={(e) => setSub(i, "title", e.target.value)} placeholder="Subtask title" aria-label={`Subtask ${i + 1} title`} />
              <Select className="col-span-5 md:col-span-3" value={s.departmentKey} onChange={(e) => setSub(i, "departmentKey", e.target.value)} aria-label="Department">
                <option value="">Same as parent</option>{DEPARTMENTS.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}
              </Select>
              <Input className="col-span-3 md:col-span-1" type="number" min={0} step={0.25} value={s.hours} onChange={(e) => setSub(i, "hours", e.target.value)} placeholder="h" aria-label="Estimate hours" />
              <Input className="col-span-3 md:col-span-2" type="number" min={0} value={s.offsetDays} onChange={(e) => setSub(i, "offsetDays", e.target.value)} placeholder="Days before" aria-label="Days before deadline" />
              <Button type="button" variant="ghost" size="icon" className="col-span-1" onClick={() => setSubs((x) => x.filter((_, j) => j !== i))} aria-label="Remove subtask"><X className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="ghost" onClick={() => setSubs((x) => [...x, { title: "", departmentKey: "", hours: "", offsetDays: "" }])}><Plus className="h-3.5 w-3.5" /> Add subtask</Button>
        </div>
      </form>
    </Modal>
  );
}
