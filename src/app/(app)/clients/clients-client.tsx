"use client";
import { useState } from "react";
import Link from "next/link";
import { Archive, Building2, Mail, Pencil, Phone, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { CLIENT_STATUSES, humanize } from "@/lib/constants";
import { api, qs } from "@/lib/client";
import { useApp } from "@/components/app-context";
import { useFetch } from "@/components/forms";
import { Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, Input, PageHeader, Select, Skeleton, Stagger, StaggerItem } from "@/components/ui";
import { ClientFormModal, type ClientInput } from "./client-form";

export type ClientRow = ClientInput & {
  id: string; accountManager: { id: string; name: string; avatarColor: string } | null; _count: { projects: number }; projects: { status: string }[];
};
export const CLIENT_STATUS_COLOR: Record<string, string> = { PROSPECT: "#38bdf8", ACTIVE: "#10b981", INACTIVE: "#94a3b8", ARCHIVED: "#475569" };

export function ClientsClient() {
  const { user } = useApp();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<ClientRow | null | "new">(null);
  const [archiving, setArchiving] = useState<ClientRow | null>(null);
  const [busy, setBusy] = useState(false);
  const { data, error, reload } = useFetch<ClientRow[]>(`/api/clients${qs({ q, status })}`);
  const canEdit = (c?: ClientRow) => user.role === "ADMIN" || (user.role === "ACCOUNT_MANAGER" && (!c || c.accountManagerId === user.id));

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Agency" title="Clients" subtitle={data ? `${data.length} client${data.length === 1 ? "" : "s"}` : "Loading…"}
        actions={canEdit() && <Button variant="primary" size="sm" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> New client</Button>} />
      <div className="glass flex flex-wrap gap-2 rounded-2xl p-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients or contacts" className="pl-9" aria-label="Search clients" />
        </div>
        <Select className="w-auto min-w-40" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All except archived</option>
          {CLIENT_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
        </Select>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {!data && !error && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40" />)}</div>}
      {data?.length === 0 && <Card><EmptyState icon={<Building2 className="h-6 w-6" />} title="No clients found" /></Card>}
      {data && data.length > 0 && (
        <Stagger className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((c) => (
            <StaggerItem key={c.id}>
              <Card hover className="flex h-full flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/clients/${c.id}`} className="min-w-0">
                    <h3 className="truncate text-base font-semibold text-fg hover:underline">{c.name}</h3>
                    <div className="truncate text-xs text-muted">{c.industry ?? "—"}</div>
                  </Link>
                  <Badge color={CLIENT_STATUS_COLOR[c.status]} dot>{humanize(c.status)}</Badge>
                </div>
                <div className="mt-4 space-y-1 text-xs text-fg-2">
                  {c.contactName && <div>{c.contactName}</div>}
                  {c.contactEmail && <div className="flex items-center gap-1.5 truncate"><Mail className="h-3.5 w-3.5 text-muted" />{c.contactEmail}</div>}
                  {c.contactPhone && <div className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-muted" />{c.contactPhone}</div>}
                </div>
                <div className="mt-auto flex items-center gap-2 pt-4 text-xs text-muted">
                  <span>{c._count.projects} project{c._count.projects === 1 ? "" : "s"} · {c.projects.filter((p) => p.status === "ACTIVE").length} active</span>
                  {c.accountManager && <span className="ml-auto inline-flex items-center gap-1.5"><Avatar name={c.accountManager.name} color={c.accountManager.avatarColor} size={20} />{c.accountManager.name}</span>}
                </div>
                {canEdit(c) && (
                  <div className="mt-3 flex gap-2 border-t border-line pt-3">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(c)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                    {c.status !== "ARCHIVED" && <Button size="sm" variant="ghost" onClick={() => setArchiving(c)}><Archive className="h-3.5 w-3.5" /> Archive</Button>}
                  </div>
                )}
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
      )}
      <ClientFormModal open={editing !== null} client={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />
      <ConfirmDialog open={!!archiving} danger title="Archive client?" confirmLabel="Archive" loading={busy}
        body={<>Archive <strong>{archiving?.name}</strong>? It will be hidden from lists but its projects and history are kept.</>}
        onClose={() => setArchiving(null)}
        onConfirm={async () => {
          if (!archiving) return;
          setBusy(true);
          try { await api(`/api/clients/${archiving.id}`, { method: "PATCH", body: { status: "ARCHIVED" } }); toast.success("Client archived"); setArchiving(null); reload(); }
          catch (e) { toast.error(e instanceof Error ? e.message : "Archive failed"); }
          finally { setBusy(false); }
        }} />
    </div>
  );
}
