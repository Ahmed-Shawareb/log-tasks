"use client";
import { useEffect, useState } from "react";
import { Crown, Pencil, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { DEPARTMENTS, ROLE_LABEL, type RoleKey } from "@/lib/constants";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";
import type { Person } from "@/lib/types";
import { useFetch } from "@/components/forms";
import { Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, PageHeader, Select, Skeleton, Stagger, StaggerItem, Textarea } from "@/components/ui";

type Team = {
  id: string; name: string; description: string | null; managerId: string | null;
  department: { key: string; name: string; color: string };
  manager: { id: string; name: string; avatarColor: string } | null;
  members: { user: { id: string; name: string; avatarColor: string; role: string; isActive: boolean; title: string | null } }[];
};

export function TeamsClient() {
  const { data, error, reload } = useFetch<Team[]>("/api/teams");
  const [editing, setEditing] = useState<Team | "new" | null>(null);
  const [deleting, setDeleting] = useState<Team | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Admin" title="Teams" subtitle="Team managers and members define who can be assigned which work."
        actions={<Button variant="primary" size="sm" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> New team</Button>} />
      {error && <p className="text-sm text-danger">{error}</p>}
      {!data && !error && <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-56" />)}</div>}
      {data?.length === 0 && <Card><EmptyState icon={<Users className="h-6 w-6" />} title="No teams yet" /></Card>}
      {data && data.length > 0 && (
        <Stagger className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((t) => (
            <StaggerItem key={t.id}>
              <Card hover className="flex h-full flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-fg">{t.name}</h3>
                    <Badge color={t.department.color}>{t.department.name}</Badge>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setEditing(t)} aria-label={`Edit ${t.name}`}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeleting(t)} aria-label={`Delete ${t.name}`}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                {t.description && <p className="mt-2 text-xs text-muted">{t.description}</p>}
                <div className="mt-4 flex items-center gap-2 text-sm">
                  <Crown className="h-4 w-4 text-amber-400" />
                  {t.manager ? <span className="inline-flex items-center gap-2"><Avatar name={t.manager.name} color={t.manager.avatarColor} size={22} />{t.manager.name}</span> : <span className="text-muted">No manager</span>}
                </div>
                <ul className="mt-3 space-y-1.5">
                  {t.members.filter((m) => m.user.id !== t.managerId).map((m) => (
                    <li key={m.user.id} className={cn("flex items-center gap-2 text-xs text-fg-2", !m.user.isActive && "opacity-50")}>
                      <Avatar name={m.user.name} color={m.user.avatarColor} size={20} /> {m.user.name}
                      <span className="ml-auto text-muted">{m.user.title ?? ROLE_LABEL[m.user.role as RoleKey]}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-3 text-[11px] text-muted">{t.members.length} member{t.members.length === 1 ? "" : "s"}</div>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
      )}
      <TeamModal team={editing === "new" ? null : editing} open={editing !== null} onClose={() => setEditing(null)} onSaved={reload} />
      <ConfirmDialog open={!!deleting} danger title="Delete team?" confirmLabel="Delete" loading={busy}
        body={<>Delete <strong>{deleting?.name}</strong>? Members keep their accounts and tasks; only the grouping is removed.</>}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          setBusy(true);
          try { await api(`/api/teams/${deleting.id}`, { method: "DELETE" }); toast.success("Team deleted"); setDeleting(null); reload(); }
          catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); }
          finally { setBusy(false); }
        }} />
    </div>
  );
}

function TeamModal({ team, open, onClose, onSaved }: { team: Team | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: "", description: "", department: "PERFORMANCE", managerId: "", memberIds: [] as string[] });
  useEffect(() => {
    if (!open) return;
    api<Person[]>("/api/users").then(setPeople).catch(() => {});
    setF(team
      ? { name: team.name, description: team.description ?? "", department: team.department.key, managerId: team.managerId ?? "", memberIds: team.members.map((m) => m.user.id) }
      : { name: "", description: "", department: "PERFORMANCE", managerId: "", memberIds: [] });
  }, [open, team]);
  const eligible = people.filter((p) => !p.department || p.department.key === f.department || p.role === "ADMIN" || p.role === "ACCOUNT_MANAGER");
  const managers = eligible.filter((p) => p.role !== "EMPLOYEE" && !(p.role === "PERFORMANCE_MANAGER" && f.department !== "PERFORMANCE") && !(p.role === "PRODUCTION_MANAGER" && f.department !== "PRODUCTION"));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const memberIds = [...new Set([...f.memberIds, ...(f.managerId ? [f.managerId] : [])])];
    const body = { name: f.name, description: f.description || null, department: f.department, managerId: f.managerId || null, memberIds };
    try {
      if (team) await api(`/api/teams/${team.id}`, { method: "PATCH", body });
      else await api("/api/teams", { body });
      toast.success("Team saved");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save team");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" title={team ? `Edit ${team.name}` : "New team"}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="team-form" loading={busy}>Save</Button></>}>
      <form id="team-form" onSubmit={save} className="grid gap-4 md:grid-cols-2">
        <Field label="Team name"><Input required minLength={2} value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} /></Field>
        <Field label="Department">
          <Select value={f.department} onChange={(e) => setF((x) => ({ ...x, department: e.target.value, managerId: "", memberIds: [] }))}>
            {DEPARTMENTS.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}
          </Select>
        </Field>
        <Field label="Team manager" className="md:col-span-2">
          <Select value={f.managerId} onChange={(e) => setF((x) => ({ ...x, managerId: e.target.value }))}>
            <option value="">No manager</option>
            {managers.map((m) => <option key={m.id} value={m.id}>{m.name} · {ROLE_LABEL[m.role as RoleKey]}</option>)}
          </Select>
        </Field>
        <Field label="Description" className="md:col-span-2"><Textarea value={f.description} onChange={(e) => setF((x) => ({ ...x, description: e.target.value }))} className="min-h-[60px]" /></Field>
        <fieldset className="md:col-span-2">
          <legend className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Members ({f.memberIds.length})</legend>
          <div className="grid max-h-64 gap-1 overflow-y-auto rounded-xl border border-line p-2 sm:grid-cols-2">
            {eligible.length === 0 && <span className="p-2 text-xs text-muted">No eligible people in this department.</span>}
            {eligible.map((p) => {
              const on = f.memberIds.includes(p.id);
              return (
                <label key={p.id} className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition", on ? "bg-accent-soft" : "hover:bg-panel-hover")}>
                  <input type="checkbox" className="accent-violet-500" checked={on} onChange={() => setF((x) => ({ ...x, memberIds: on ? x.memberIds.filter((i) => i !== p.id) : [...x.memberIds, p.id] }))} />
                  <Avatar name={p.name} color={p.avatarColor} size={20} />
                  <span className="truncate text-fg-2">{p.name}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
