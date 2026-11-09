"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Hash, Plus, Shapes, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Stagger, StaggerItem, Textarea } from "@/components/ui";
import { ICON_NAMES, TypeIcon, resetTaskTypesCache, stepColor, type TaskTypeOpt } from "@/components/tasks/task-types";

const COLORS = ["#f97316", "#ec4899", "#a855f7", "#8b5cf6", "#3b82f6", "#06b6d4", "#14b8a6", "#22c55e", "#eab308", "#e11d48"];
const blank = { name: "", counted: false, unit: "", unitPlural: "", pluralEdited: false, icon: "sparkles", color: "#8b5cf6", description: "", isActive: true, stages: [] as string[] };
/** reel -> reels, story -> stories, box -> boxes (the admin can still type their own). */
const pluralOf = (w: string) => !w ? "" : /[^aeiou]y$/i.test(w) ? `${w.slice(0, -1)}ies` : /(s|x|z|ch|sh)$/i.test(w) ? `${w}es` : `${w}s`;

export function TaskTypesClient() {
  const [types, setTypes] = useState<TaskTypeOpt[] | null>(null);
  const [editing, setEditing] = useState<TaskTypeOpt | "new" | null>(null);
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<TaskTypeOpt[]>("/api/task-types?all=1").then(setTypes).catch((e) => toast.error(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const open = (t: TaskTypeOpt | "new") => {
    setEditing(t);
    setF(t === "new" ? blank : { name: t.name, counted: !!t.unit, unit: t.unit ?? "", unitPlural: t.unitPlural ?? "", pluralEdited: !!t.unit && t.unitPlural !== pluralOf(t.unit), icon: t.icon, color: t.color, description: t.description ?? "", isActive: t.isActive ?? true, stages: t.stages ?? [] });
  };
  const save = async () => {
    setBusy(true);
    try {
      const unit = f.counted ? f.unit.trim() : "";
      const body = {
        name: f.name, icon: f.icon, color: f.color, isActive: f.isActive, description: f.description || null,
        unit: unit || null, unitPlural: unit ? (f.unitPlural.trim() || pluralOf(unit)) : null,
        stages: f.counted ? f.stages.map((x) => x.trim()).filter(Boolean) : [],
      };
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
      <PageHeader eyebrow="Admin" title="Task types" subtitle="The kinds of work your agency sells. Give a type a counter (reels, posts…) to order it as a number and split it between people."
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
        footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" loading={busy} onClick={save} disabled={f.name.trim().length < 2 || (f.counted && !f.unit.trim())}>Save</Button></>}>
        <div className="space-y-4">
          <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Videos" /></Field>
          <Field label="Counter" hint="Counted types are ordered as a number (e.g. 12 reels) and can be split between people.">
            <div className="grid grid-cols-2 gap-2">
              {([[false, "Single task", "One piece of work"], [true, "Has a counter", "A number of things, e.g. 12 reels"]] as const).map(([v, label, hint]) => (
                <button key={label} type="button" onClick={() => setF({ ...f, counted: v })}
                  className={cn("rounded-xl border px-3 py-2.5 text-left transition", f.counted === v ? "border-[var(--accent)] bg-accent-soft" : "border-line hover:border-line-strong")}>
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-fg">{v && <Hash className="h-3.5 w-3.5" />}{label}</div>
                  <div className="text-[11px] text-muted">{hint}</div>
                </button>
              ))}
            </div>
          </Field>
          {f.counted && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="What is counted?" hint="One of them, e.g. reel">
                  <Input value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value, unitPlural: f.pluralEdited ? f.unitPlural : pluralOf(e.target.value.trim()) })} placeholder="reel" />
                </Field>
                <Field label="More than one" hint="Filled in for you; change it if needed">
                  <Input value={f.unitPlural} onChange={(e) => setF({ ...f, unitPlural: e.target.value, pluralEdited: true })} placeholder={pluralOf(f.unit.trim()) || "reels"} disabled={!f.unit.trim()} />
                </Field>
              </div>
              <Field label="Steps (optional)" hint="Every one of them goes through these steps in order; each step is planned before the next.">
                <div className="space-y-2">
                  {f.stages.map((st, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[11px] font-bold text-white" style={{ background: stepColor(st, i) }}>{i + 1}</span>
                      <Input value={st} onChange={(e) => setF({ ...f, stages: f.stages.map((x, k) => (k === i ? e.target.value : x)) })} placeholder={["Script writing", "Filming", "Editing"][i] ?? "Next step"} aria-label={`Step ${i + 1}`} />
                      <Button type="button" size="icon" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => { const n = [...f.stages]; [n[i - 1], n[i]] = [n[i]!, n[i - 1]!]; setF({ ...f, stages: n }); }}><ArrowUp className="h-4 w-4" /></Button>
                      <Button type="button" size="icon" variant="ghost" aria-label="Move down" disabled={i === f.stages.length - 1} onClick={() => { const n = [...f.stages]; [n[i + 1], n[i]] = [n[i]!, n[i + 1]!]; setF({ ...f, stages: n }); }}><ArrowDown className="h-4 w-4" /></Button>
                      <Button type="button" size="icon" variant="ghost" aria-label="Remove step" onClick={() => setF({ ...f, stages: f.stages.filter((_, k) => k !== i) })}><X className="h-4 w-4" /></Button>
                    </div>
                  ))}
                  {f.stages.length < 8 && <Button type="button" size="sm" onClick={() => setF({ ...f, stages: [...f.stages, ""] })}><Plus className="h-4 w-4" /> Add a step</Button>}
                </div>
              </Field>
            </>
          )}
          {/* How it will look when someone creates a task of this type */}
          <div className="rounded-2xl border border-dashed border-line p-3">
            <div className="mb-2 text-[11px] uppercase tracking-wider text-muted">Preview</div>
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: `linear-gradient(135deg, ${f.color}, color-mix(in srgb, ${f.color} 55%, #000))` }}><TypeIcon icon={f.icon} className="h-5 w-5" /></span>
              <div className="min-w-0">
                <div className="truncate font-semibold text-fg">{f.name.trim() || "Task type name"}</div>
                <div className="truncate text-xs text-muted">
                  {f.counted && f.unit.trim() ? `e.g. 12 ${f.unitPlural.trim() || pluralOf(f.unit.trim())}` : "A single task"}
                  {f.counted && f.stages.filter((x) => x.trim()).length > 0 && ` · ${f.stages.filter((x) => x.trim()).join(" → ")}`}
                </div>
              </div>
            </div>
          </div>
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
