"use client";
import { Fragment, useState } from "react";
import { ChevronRight, ScrollText, Search } from "lucide-react";
import { fmtDateTime, qs } from "@/lib/client";
import { cn } from "@/lib/utils";
import { useFetch } from "@/components/forms";
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, Skeleton } from "@/components/ui";

type Entry = {
  id: string; actorEmail: string | null; actorRole: string | null; action: string; entityType: string; entityId: string | null;
  before: unknown; after: unknown; ipAddress: string | null; createdAt: string;
};
const ENTITIES = ["Task", "User", "Team", "Client", "Project", "Leave", "TaskTemplate"];
const actionColor = (a: string) => /fail|delete|deactivate|cancel|archive/.test(a) ? "#ef4444" : /create|approved/.test(a) ? "#10b981" : /login|password|reset/.test(a) ? "#38bdf8" : "#a78bfa";

export function AuditClient() {
  const [q, setQ] = useState("");
  const [entityType, setEntityType] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const { data, error } = useFetch<{ items: Entry[]; total: number; page: number }>(`/api/audit${qs({ q, entityType, page })}`);
  const pages = data ? Math.max(1, Math.ceil(data.total / 50)) : 1;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Admin" title="Audit log" subtitle="Significant and administrative actions, with before/after values. Visible to administrators only." />
      <div className="glass flex flex-wrap gap-2 rounded-2xl p-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Action, actor email or entity id" className="pl-9" aria-label="Search audit log" />
        </div>
        <Select className="w-auto min-w-40" value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }} aria-label="Entity type">
          <option value="">All entities</option>
          {ENTITIES.map((e) => <option key={e} value={e}>{e}</option>)}
        </Select>
      </div>
      <Card className="overflow-hidden">
        {error && <p className="px-5 py-4 text-sm text-danger">{error}</p>}
        {!data && !error && <div className="space-y-2 p-5">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>}
        {data?.items.length === 0 && <EmptyState icon={<ScrollText className="h-6 w-6" />} title="No entries" />}
        {data && data.items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-b border-line text-[11px] uppercase tracking-wider text-muted">
                <tr><th className="w-8" /><th className="px-3 py-3 text-left">When</th><th className="px-3 text-left">Actor</th><th className="px-3 text-left">Action</th><th className="px-3 text-left">Entity</th><th className="px-3 text-left">IP</th></tr>
              </thead>
              <tbody>
                {data.items.map((e) => {
                  const expandable = e.before != null || e.after != null;
                  const isOpen = open === e.id;
                  return (
                    <Fragment key={e.id}>
                      <tr className={cn("border-b border-line", expandable && "cursor-pointer hover:bg-panel-hover")} onClick={() => expandable && setOpen(isOpen ? null : e.id)}>
                        <td className="pl-3">{expandable && <ChevronRight className={cn("h-4 w-4 text-muted transition-transform", isOpen && "rotate-90")} aria-label={isOpen ? "Collapse" : "Expand"} />}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted">{fmtDateTime(e.createdAt)}</td>
                        <td className="px-3 text-xs"><span className="text-fg-2">{e.actorEmail ?? "system"}</span>{e.actorRole && <span className="block text-[10px] text-muted">{e.actorRole}</span>}</td>
                        <td className="px-3"><Badge color={actionColor(e.action)}>{e.action}</Badge></td>
                        <td className="px-3 text-xs text-fg-2">{e.entityType}<span className="block font-mono text-[10px] text-muted">{e.entityId}</span></td>
                        <td className="px-3 font-mono text-[11px] text-muted">{e.ipAddress ?? "—"}</td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-line bg-[var(--bg)]/40">
                          <td colSpan={6} className="px-6 py-3">
                            <div className="grid gap-3 md:grid-cols-2">
                              {(["before", "after"] as const).map((k) => (
                                <div key={k}>
                                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">{k}</div>
                                  <pre className="max-h-64 overflow-auto rounded-lg border border-line bg-panel p-3 text-[11px] text-fg-2">{e[k] == null ? "—" : JSON.stringify(e[k], null, 2)}</pre>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > 50 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-muted">
            <span>Page {page} of {pages} · {data.total} entries</span>
            <div className="flex gap-2">
              <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
