"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CLIENT_STATUSES, humanize } from "@/lib/constants";
import { api } from "@/lib/client";
import type { Person } from "@/lib/types";
import { useApp } from "@/components/app-context";
import { Button, Field, Input, Modal, Select, Textarea } from "@/components/ui";

export type ClientInput = {
  id?: string; name: string; contactName: string | null; contactEmail: string | null; contactPhone: string | null;
  industry: string | null; notes: string | null; status: string; accountManagerId: string | null;
};

export function ClientFormModal({ open, onClose, onSaved, client }: { open: boolean; onClose: () => void; onSaved: () => void; client?: ClientInput | null }) {
  const { isAdmin } = useApp();
  const [ams, setAms] = useState<Person[]>([]);
  const [busy, setBusy] = useState(false);
  const blank: ClientInput = { name: "", contactName: "", contactEmail: "", contactPhone: "", industry: "", notes: "", status: "ACTIVE", accountManagerId: "" };
  const [f, setF] = useState<ClientInput>(blank);
  useEffect(() => {
    if (!open) return;
    setF(client ? { ...client } : blank);
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
    if (isAdmin) body.accountManagerId = f.accountManagerId || null;
    try {
      if (client?.id) await api(`/api/clients/${client.id}`, { method: "PATCH", body });
      else await api("/api/clients", { body });
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
        <Field label="Client name" className="md:col-span-2"><Input required minLength={2} value={f.name} onChange={set("name")} /></Field>
        <Field label="Contact person"><Input value={f.contactName ?? ""} onChange={set("contactName")} /></Field>
        <Field label="Industry"><Input value={f.industry ?? ""} onChange={set("industry")} placeholder="e.g. Food & Beverage" /></Field>
        <Field label="Contact email"><Input type="email" value={f.contactEmail ?? ""} onChange={set("contactEmail")} /></Field>
        <Field label="Contact phone"><Input type="tel" value={f.contactPhone ?? ""} onChange={set("contactPhone")} /></Field>
        <Field label="Status"><Select value={f.status} onChange={set("status")}>{CLIENT_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select></Field>
        {isAdmin && (
          <Field label="Account manager">
            <Select value={f.accountManagerId ?? ""} onChange={set("accountManagerId")}>
              <option value="">None</option>
              {ams.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Notes" className="md:col-span-2"><Textarea value={f.notes ?? ""} onChange={set("notes")} placeholder="Meeting notes, preferences, contract terms…" /></Field>
      </form>
    </Modal>
  );
}
