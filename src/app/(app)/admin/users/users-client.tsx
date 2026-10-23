"use client";
import { useEffect, useState } from "react";
import { KeyRound, Pencil, Plus, Power, Search, UserCog } from "lucide-react";
import { toast } from "sonner";
import { DEPARTMENTS, MANAGER_DEPARTMENT, ROLES, ROLE_LABEL, type RoleKey } from "@/lib/constants";
import { api, qs, relative } from "@/lib/client";
import { cn, formatMinutes } from "@/lib/utils";
import type { Person } from "@/lib/types";
import { useApp } from "@/components/app-context";
import { ColorSwatches, CopyField, WeekdayPicker, minToTime, timeToMin, useFetch } from "@/components/forms";
import { Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, PageHeader, Select, Skeleton } from "@/components/ui";

type UserRow = Person & { phone: string | null; isTestAccount: boolean; lastLoginAt: string | null; memberships: { team: { id: string; name: string } }[] };
type Team = { id: string; name: string; department: { key: string; name: string } };

const ROLE_COLOR: Record<RoleKey, string> = { ADMIN: "#e11d48", ACCOUNT_MANAGER: "#8b5cf6", PERFORMANCE_MANAGER: "#06b6d4", PRODUCTION_MANAGER: "#f59e0b", EMPLOYEE: "#22c55e" };

export function UsersClient() {
  const { user: me } = useApp();
  const [q, setQ] = useState("");
  const [inactive, setInactive] = useState(false);
  const { data, error, reload } = useFetch<UserRow[]>(`/api/users${qs({ q, inactive: inactive ? "1" : undefined })}`);
  const [editing, setEditing] = useState<UserRow | "new" | null>(null);
  const [toggling, setToggling] = useState<UserRow | null>(null);
  const [link, setLink] = useState<{ title: string; url: string; note: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const resetLink = async (u: UserRow) => {
    try {
      const r = await api<{ resetPath: string; expiresInMinutes: number }>(`/api/users/${u.id}?action=reset-link`, { method: "POST" });
      setLink({ title: `Reset link for ${u.name}`, url: window.location.origin + r.resetPath, note: `Single use, expires in ${r.expiresInMinutes} minutes. Share it privately; it is shown only once.` });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not create link"); }
  };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Admin" title="Users" subtitle="Roles are assigned here explicitly. An email address alone never grants access."
        actions={<Button variant="primary" size="sm" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> New user</Button>} />
      <div className="glass flex flex-wrap items-center gap-2 rounded-2xl p-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email" className="pl-9" aria-label="Search users" />
        </div>
        <label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-line bg-panel px-3 text-xs text-fg-2">
          <input type="checkbox" className="accent-violet-500" checked={inactive} onChange={(e) => setInactive(e.target.checked)} /> Include inactive
        </label>
      </div>
      <Card className="overflow-hidden">
        {error && <p className="px-5 py-4 text-sm text-danger">{error}</p>}
        {!data && !error && <div className="space-y-2 p-5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>}
        {data?.length === 0 && <EmptyState icon={<UserCog className="h-6 w-6" />} title="No users found" />}
        {data && data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b border-line text-[11px] uppercase tracking-wider text-muted">
                <tr><th className="px-4 py-3 text-left">User</th><th className="px-3 text-left">Role</th><th className="px-3 text-left">Department / teams</th><th className="px-3 text-left">Schedule</th><th className="px-3 text-left">Last sign-in</th><th className="px-4 text-right">Actions</th></tr>
              </thead>
              <tbody>
                {data.map((u) => (
                  <tr key={u.id} className={cn("border-b border-line hover:bg-panel-hover", !u.isActive && "opacity-55")}>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-3">
                        <Avatar name={u.name} color={u.avatarColor} size={32} />
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 text-fg">{u.name}{u.isTestAccount && <Badge color="#f59e0b">test</Badge>}{!u.isActive && <Badge color="#94a3b8">inactive</Badge>}</span>
                          <span className="block truncate text-xs text-muted">{u.email}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-3"><Badge color={ROLE_COLOR[u.role as RoleKey]}>{ROLE_LABEL[u.role as RoleKey]}</Badge></td>
                    <td className="px-3 text-xs text-fg-2">{u.department?.name ?? "—"}{u.memberships.length > 0 && <div className="text-muted">{u.memberships.map((m) => m.team.name).join(", ")}</div>}</td>
                    <td className="px-3 text-xs text-muted">{minToTime(u.workStartMin)}–{minToTime(u.workEndMin)} · {formatMinutes(u.weeklyCapacityMin)}/wk</td>
                    <td className="px-3 text-xs text-muted">{u.lastLoginAt ? relative(u.lastLoginAt) : "Never"}</td>
                    <td className="px-4">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(u)} aria-label={`Edit ${u.name}`}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => resetLink(u)} title="Generate password reset link" aria-label={`Reset link for ${u.name}`}><KeyRound className="h-3.5 w-3.5" /></Button>
                        {u.id !== me.id && <Button size="sm" variant="ghost" onClick={() => setToggling(u)} title={u.isActive ? "Deactivate" : "Activate"} aria-label={`${u.isActive ? "Deactivate" : "Activate"} ${u.name}`}><Power className={cn("h-3.5 w-3.5", u.isActive ? "text-red-400" : "text-emerald-400")} /></Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <UserModal user={editing === "new" ? null : editing} open={editing !== null} onClose={() => setEditing(null)}
        onSaved={(setupPath, name) => { reload(); if (setupPath) setLink({ title: `Account created for ${name}`, url: window.location.origin + setupPath, note: "Send this single-use setup link privately so they can choose a password. It expires in 60 minutes and is shown only once." }); }} />
      <ConfirmDialog open={!!toggling} danger={toggling?.isActive} loading={busy}
        title={toggling?.isActive ? "Deactivate user?" : "Reactivate user?"} confirmLabel={toggling?.isActive ? "Deactivate" : "Activate"}
        body={toggling?.isActive
          ? <><strong>{toggling.name}</strong> will be signed out everywhere and can no longer receive new work. Their history and past assignments are kept.</>
          : <><strong>{toggling?.name}</strong> will be able to sign in and receive work again.</>}
        onClose={() => setToggling(null)}
        onConfirm={async () => {
          if (!toggling) return;
          setBusy(true);
          try { await api(`/api/users/${toggling.id}`, { method: "PATCH", body: { isActive: !toggling.isActive } }); toast.success(toggling.isActive ? "User deactivated" : "User activated"); setToggling(null); reload(); }
          catch (e) { toast.error(e instanceof Error ? e.message : "Update failed"); }
          finally { setBusy(false); }
        }} />
      <Modal open={!!link} onClose={() => setLink(null)} title={link?.title ?? ""} size="md" footer={<Button variant="primary" onClick={() => setLink(null)}>Done</Button>}>
        {link && <div className="space-y-3"><CopyField value={link.url} /><p className="text-xs text-muted">{link.note}</p></div>}
      </Modal>
    </div>
  );
}

function UserModal({ user, open, onClose, onSaved }: { user: UserRow | null; open: boolean; onClose: () => void; onSaved: (setupPath: string | null, name: string) => void }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [busy, setBusy] = useState(false);
  const blank = { name: "", email: "", role: "EMPLOYEE", department: "", title: "", phone: "", avatarColor: "#8b5cf6", teamIds: [] as string[], workDays: [7, 1, 2, 3, 4], start: "09:00", end: "18:00", capacity: "40", isActive: true };
  const [f, setF] = useState(blank);
  useEffect(() => {
    if (!open) return;
    api<Team[]>("/api/teams").then(setTeams).catch(() => {});
    setF(user ? {
      name: user.name, email: user.email, role: user.role, department: user.department?.key ?? "", title: user.title ?? "", phone: user.phone ?? "",
      avatarColor: user.avatarColor, teamIds: user.memberships.map((m) => m.team.id), workDays: user.workDays, start: minToTime(user.workStartMin),
      end: minToTime(user.workEndMin), capacity: String(user.weeklyCapacityMin / 60), isActive: user.isActive,
    } : blank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user]);
  const forced = MANAGER_DEPARTMENT[f.role as RoleKey];
  const dept = forced ?? f.department;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.workDays.length) return toast.error("Choose at least one working day.");
    setBusy(true);
    const body: Record<string, unknown> = {
      name: f.name, email: f.email, role: f.role, department: forced ?? (f.department || null), title: f.title || null, phone: f.phone || null,
      avatarColor: f.avatarColor, teamIds: f.teamIds, workDays: f.workDays, workStartMin: timeToMin(f.start), workEndMin: timeToMin(f.end) || 1440,
      weeklyCapacityMin: Math.round(Number(f.capacity || 0) * 60),
    };
    try {
      if (user) {
        await api(`/api/users/${user.id}`, { method: "PATCH", body: { ...body, isActive: f.isActive } });
        toast.success("User updated");
        onSaved(null, f.name);
      } else {
        const r = await api<{ setupPath: string }>("/api/users", { body });
        toast.success("User created");
        onSaved(r.setupPath, f.name);
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save user");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" title={user ? `Edit ${user.name}` : "New user"} subtitle={user ? undefined : "They get a one-time link to set their own password. No password is ever shown or emailed."}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="user-form" loading={busy}>{user ? "Save" : "Create user"}</Button></>}>
      <form id="user-form" onSubmit={save} className="grid gap-4 md:grid-cols-2">
        <Field label="Full name"><Input required minLength={2} value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} /></Field>
        <Field label="Work email"><Input type="email" required value={f.email} onChange={(e) => setF((x) => ({ ...x, email: e.target.value }))} /></Field>
        <Field label="Role">
          <Select value={f.role} onChange={(e) => setF((x) => ({ ...x, role: e.target.value, teamIds: [] }))}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </Select>
        </Field>
        <Field label="Department" hint={forced ? "Fixed by the role" : undefined}>
          <Select value={dept} disabled={!!forced} onChange={(e) => setF((x) => ({ ...x, department: e.target.value, teamIds: [] }))}>
            <option value="">Default for role</option>
            {DEPARTMENTS.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}
          </Select>
        </Field>
        <Field label="Job title"><Input value={f.title} onChange={(e) => setF((x) => ({ ...x, title: e.target.value }))} placeholder="e.g. Graphic Designer" /></Field>
        <Field label="Phone"><Input type="tel" value={f.phone} onChange={(e) => setF((x) => ({ ...x, phone: e.target.value }))} /></Field>
        <Field label="Teams" className="md:col-span-2">
          <div className="flex flex-wrap gap-2">
            {teams.length === 0 && <span className="text-xs text-muted">No teams yet.</span>}
            {teams.map((t) => {
              const on = f.teamIds.includes(t.id);
              const allowed = !dept || t.department.key === dept || f.role === "ADMIN" || f.role === "ACCOUNT_MANAGER";
              return (
                <button key={t.id} type="button" disabled={!allowed} aria-pressed={on}
                  onClick={() => setF((x) => ({ ...x, teamIds: on ? x.teamIds.filter((i) => i !== t.id) : [...x.teamIds, t.id] }))}
                  className={cn("rounded-lg border px-3 py-1.5 text-xs transition disabled:opacity-40", on ? "border-accent/60 bg-accent-soft text-fg" : "border-line text-muted hover:text-fg")}>
                  {t.name} <span className="text-muted">· {t.department.name}</span>
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Working days" className="md:col-span-2"><WeekdayPicker value={f.workDays} onChange={(v) => setF((x) => ({ ...x, workDays: v }))} /></Field>
        <Field label="Day starts"><Input type="time" value={f.start} onChange={(e) => setF((x) => ({ ...x, start: e.target.value }))} /></Field>
        <Field label="Day ends"><Input type="time" value={f.end} onChange={(e) => setF((x) => ({ ...x, end: e.target.value }))} /></Field>
        <Field label="Weekly capacity (hours)"><Input type="number" min={0} max={100} value={f.capacity} onChange={(e) => setF((x) => ({ ...x, capacity: e.target.value }))} /></Field>
        <Field label="Avatar color"><ColorSwatches value={f.avatarColor} onChange={(c) => setF((x) => ({ ...x, avatarColor: c }))} /></Field>
        {user && (
          <label className="flex items-center gap-2 text-sm text-fg-2 md:col-span-2">
            <input type="checkbox" className="accent-violet-500" checked={f.isActive} onChange={(e) => setF((x) => ({ ...x, isActive: e.target.checked }))} /> Account active
          </label>
        )}
      </form>
    </Modal>
  );
}
