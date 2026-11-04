"use client";
import { useCallback, useEffect, useState } from "react";
import { Hash, Plus, Shapes } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Stagger, StaggerItem, Textarea } from "@/components/ui";
import { ICON_NAMES, TypeIcon, resetTaskTypesCache, type TaskTypeOpt } from "@/components/tasks/task-types";

const COLORS = ["#f97316", "#ec4899", "#a855f7", "#8b5cf6", "#3b82f6", "#06b6d4", "#14b8a6", "#22c55e", "#eab308", "#e11d48"];
const blank = { name: "", unit: "", unitPlural: "", icon: "sparkles", color: "#8b5cf6", description: "", isActive: true, stages: "" };

export function TaskTypesClient() {
  const [types, setTypes] = useState<TaskTypeOpt[] | null>(null);
  const [editing, setEditing] = useState<TaskTypeOpt | "new" | null>(null);
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<TaskTypeOpt[]>("/api/task-types?all=1").then(setTypes).catch((e) => toast.error(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const open = (t: TaskTypeOpt | "new") => {
    setEditing(t);
    setF(t === "new" ? blank : { name: t.name, unit: t.unit ?? "", unitPlural: t.unitPlural ?? "", icon: t.icon, color: t.color, description: t.description ?? "", isActive: t.isActive ?? true, stages: (t.stages ?? []).join("\n") });
  };
  const save = async () => {
    setBusy(true);
    try {
      const body = { ...f, unit: f.unit || null, unitPlural: f.unitPlural || null, description: f.description || null, stages: f.stages.split("\n").map((x) => x.trim()).filter(Boolean) };
      if (editing === "new") await api("/api/task-types", { body });
      else if (editing) await api(`/api/task-types/${editing.id}`, { method: "PATCH", body });
      toast.success("Saved");
      resetTaskTypesCache();
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Task types" subtitle="The fixed tasks your agency sells. Give a type a unit (video, post…) to make it countable and splittable."
        actions={<Button variant="primary" size="sm" onClick={() => open("new")}><Plus className="h-4 w-4" /> New type</Button>} />
      {types && types.length === 0 && <EmptyState icon={<Shapes className="h-6 w-6" />} title="No task types yet" />}
      <Stagger className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {types?.map((t) => (
          <StaggerItem key={t.id}>
            <Card hover className={cn("flex cursor-pointer items-center gap-4 p-4", !t.isActive && "opacity-50")} onClick={() => open(t)}>
              <span className="grid h-11 w-11 place-items-center rounded-2xl text-white" style={{ background: `linear-gradient(135deg, ${t.color}, color-mix(in srgb, ${t.color} 55%, #000))` }}><TypeIcon icon={t.icon} className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-fg">{t.name}</div>
                <div className="truncate text-xs text-muted">{t.stages?.length ? t.stages.join(" → ") : t.description}</div>
              </div>
              {t.unit ? <Badge color="#f59e0b"><Hash className="h-3 w-3" />{t.unitPlural}</Badge> : <Badge color="#64748b">single</Badge>}
            </Card>
          </StaggerItem>
        ))}
      </Stagger>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "New task type" : "Edit task type"}
        footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" loading={busy} onClick={save} disabled={f.name.trim().length < 2}>Save</Button></>}>
        <div className="space-y-4">
          <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Videos" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Unit (optional)" hint="Makes it countable, e.g. video"><Input value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} placeholder="video" /></Field>
            <Field label="Plural"><Input value={f.unitPlural} onChange={(e) => setF({ ...f, unitPlural: e.target.value })} placeholder={f.unit ? `${f.unit}s` : "videos"} disabled={!f.unit} /></Field>
          </div>
          <Field label="Steps (one per line, in order)" hint="Each step must be planned before the next one, e.g. Script writing → Filming → Editing">
            <Textarea value={f.stages} onChange={(e) => setF({ ...f, stages: e.target.value })} className="min-h-[90px]" placeholder={"Script writing\nFilming\nEditing"} />
          </Field>
          <Field label="Icon">
            <div className="flex flex-wrap gap-2">
              {ICON_NAMES.map((i) => (
                <button key={i} type="button" onClick={() => setF({ ...f, icon: i })} aria-label={i}
                  className={cn("grid h-9 w-9 place-items-center rounded-xl border transition", f.icon === i ? "border-accent bg-accent-soft text-fg" : "border-line text-muted hover:text-fg")}>
                  <TypeIcon icon={i} className="h-4 w-4" />
                </button>
              ))}
            </div>
          </Field>
          <Field label="Colour">
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => <button key={c} type="button" onClick={() => setF({ ...f, color: c })} aria-label={c} className={cn("h-8 w-8 rounded-full ring-offset-2 ring-offset-[var(--bg)]", f.color === c && "ring-2 ring-white")} style={{ background: c }} />)}
            </div>
          </Field>
          <Field label="Description"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="min-h-[60px]" /></Field>
          {editing !== "new" && (
            <label className="flex items-center gap-2 text-sm text-fg-2">
              <input type="checkbox" className="accent-violet-500" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} /> Available when creating tasks
            </label>
          )}
        </div>
      </Modal>
    </div>
  );
}
