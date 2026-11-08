"use client";
import { useEffect, useState } from "react";
import { Copy, Lock, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { CLIENT_STATUSES, humanize } from "@/lib/constants";
import { api } from "@/lib/client";
import type { Person } from "@/lib/types";
import { useApp } from "@/components/app-context";
import { cn } from "@/lib/utils";
import { Button, Field, Input, Modal, Select, Textarea } from "@/components/ui";
import { suggestPassword } from "./portal-login";

export type ClientInput = {
  id?: string; name: string; contactName: string | null; contactEmail: string | null; contactPhone: string | null;
  industry: string | null; notes: string | null; status: string; accountManagerId: string | null;
  privateOwnerId?: string | null;
};

export function ClientFormModal({ open, onClose, onSaved, client }: { open: boolean; onClose: () => void; onSaved: () => void; client?: ClientInput | null }) {
  const { isAdmin, user } = useApp();
  // New client: LOG client, or a personal client that only its owner (and people given its tasks) can see.
  const [personal, setPersonal] = useState(false);
  const isPersonal = client?.id ? !!client.privateOwnerId : personal;
  const [ams, setAms] = useState<Person[]>([]);
  const [busy, setBusy] = useState(false);
  const blank: ClientInput = { name: "", contactName: "", contactEmail: "", contactPhone: "", industry: "", notes: "", status: "ACTIVE", accountManagerId: "" };
  const [f, setF] = useState<ClientInput>(blank);
  const [login, setLogin] = useState({ email: "", password: "" });
  // The current dashboard login (loaded fresh so an edit never silently replaces an existing password).
  const [had, setHad] = useState<{ email: string; isActive: boolean } | null | undefined>(undefined);
  useEffect(() => {
    if (!open) return;
    setF(client ? { ...client } : blank);
    setPersonal(false);
    setHad(client?.id ? undefined : null);
    setLogin({ email: "", password: client?.id ? "" : suggestPassword() });
    if (client?.id && isAdmin) {
      api<{ portalLogin: { email: string; isActive: boolean } | null }>(`/api/clients/${client.id}`).then((c) => {
        setHad(c.portalLogin);
        setLogin({ email: c.portalLogin?.email ?? "", password: c.portalLogin ? "" : suggestPassword() });
      }).catch(() => setHad(null));
    }
    if (isAdmin) api<Person[]>("/api/users").then((u) => setAms(u.filter((p) => p.role === "ACCOUNT_MANAGER"))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, client]);
  const set = (k: keyof ClientInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const body: Record<string, unknown> = {
      name: f.name, contactName: f.contactName || null, contactEmail: f.contactEmail || null, contactPhone: f.contactPhone || null,
      industry: f.industry || null, notes: f.notes || null, status: f.status,
    };
    if (isAdmin && !isPersonal) body.accountManagerId = f.accountManagerId || null;
    if (!client?.id && personal) body.personal = true;
    try {
      const id = client?.id ?? (await api<{ id: string }>("/api/clients", { body })).id;
      if (client?.id) await api(`/api/clients/${client.id}`, { method: "PATCH", body });
      const loginChanged = login.email && (!had || login.password || login.email.trim().toLowerCase() !== had.email);
      if (isAdmin && had !== undefined && loginChanged) {
        try { await api(`/api/clients/${id}/portal`, { method: "PUT", body: { email: login.email, ...(login.password ? { password: login.password } : {}) } }); }
        catch (err) { toast.error(`Client saved, but the dashboard login was not: ${err instanceof Error ? err.message : "error"}`); setBusy(false); return; }
      }
      toast.success(client?.id ? "Client updated" : "Client created");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save client");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" title={client?.id ? "Edit client" : "New client"}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="client-form" loading={busy}>Save</Button></>}>
      <form id="client-form" onSubmit={save} className="grid gap-4 md:grid-cols-2">
        {user.canOwnPrivateClients && !client?.id && (
          <Field label="Who is this client for?" className="md:col-span-2">
            <div className="grid gap-2 sm:grid-cols-2">
              {([[false, "LOG client", "The agency's client: the team and the admins can work on it"], [true, "Personal client", "Yours only: nobody else sees it, not even the other admins"]] as const).map(([v, label, hint]) => (
                <button key={label} type="button" onClick={() => setPersonal(v)}
                  className={cn("rounded-xl border px-3 py-2.5 text-left transition", personal === v ? "border-[var(--accent)] bg-accent-soft" : "border-line hover:border-line-strong")}>
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-fg">{v && <Lock className="h-3.5 w-3.5" />}{label}</div>
                  <div className="text-[11px] text-muted">{hint}</div>
                </button>
              ))}
            </div>
          </Field>
        )}
        {isPersonal && (
          <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-fg-2 md:col-span-2">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
            Personal client: only you see it and its projects. Anyone you give a task to sees just that task. Its client dashboard has no LOG branding.
          </p>
        )}
        <Field label="Client name" className="md:col-span-2"><Input required minLength={2} value={f.name} onChange={set("name")} /></Field>
        <Field label="Contact person"><Input value={f.contactName ?? ""} onChange={set("contactName")} /></Field>
        <Field label="Industry"><Input value={f.industry ?? ""} onChange={set("industry")} placeholder="e.g. Food & Beverage" /></Field>
        <Field label="Contact email"><Input type="email" value={f.contactEmail ?? ""} onChange={set("contactEmail")} /></Field>
        <Field label="Contact phone"><Input type="tel" value={f.contactPhone ?? ""} onChange={set("contactPhone")} /></Field>
        <Field label="Status"><Select value={f.status} onChange={set("status")}>{CLIENT_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select></Field>
        {isAdmin && !isPersonal && (
          <Field label="Account manager">
            <Select value={f.accountManagerId ?? ""} onChange={set("accountManagerId")}>
              <option value="">None</option>
              {ams.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
        )}
        {isAdmin && had !== undefined && (
          <div className="rounded-2xl border border-line p-4 md:col-span-2">
            <div className="text-sm font-semibold text-fg">Client dashboard login</div>
            <p className="mb-3 text-[11px] text-muted">
              {had ? "The client already has a login. Type a new password only if you want to change it." : `Optional. The client uses this to sign in at ${isPersonal ? "/space/login" : "/portal/login"} and follow their work.`}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Login email"><Input type="email" value={login.email} onChange={(e) => setLogin((l) => ({ ...l, email: e.target.value }))} placeholder="client@company.com" /></Field>
              <Field label={had ? "New password" : "Password"} hint="Copy it before saving — it can't be shown again.">
                <div className="flex gap-2">
                  <Input value={login.password} onChange={(e) => setLogin((l) => ({ ...l, password: e.target.value }))} autoComplete="new-password" placeholder={had ? "Leave empty to keep" : ""} />
                  <Button type="button" variant="ghost" size="icon" aria-label="Suggest a password" title="Suggest a password" onClick={() => setLogin((l) => ({ ...l, password: suggestPassword() }))}><RefreshCw className="h-4 w-4" /></Button>
                  {login.password && <Button type="button" variant="ghost" size="icon" aria-label="Copy password" title="Copy password" onClick={() => navigator.clipboard.writeText(login.password).then(() => toast.success("Password copied"), () => toast.error("Copy failed"))}><Copy className="h-4 w-4" /></Button>}
                </div>
              </Field>
            </div>
          </div>
        )}
        <Field label="Notes" className="md:col-span-2"><Textarea value={f.notes ?? ""} onChange={set("notes")} placeholder="Meeting notes, preferences, contract terms…" /></Field>
      </form>
    </Modal>
  );
}
