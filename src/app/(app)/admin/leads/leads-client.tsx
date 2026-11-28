"use client";
import { useState } from "react";
import { Check, Inbox, Mail, MessageCircle, Phone, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { api, relative } from "@/lib/client";
import { cn } from "@/lib/utils";
import { useFetch } from "@/components/forms";
import { Badge, Button, Card, EmptyState, PageHeader, Segmented, Skeleton } from "@/components/ui";

// Enquiries sent from the website's "Start a project" form.

type Lead = { id: string; fullName: string; companyName: string | null; email: string; phone: string | null; service: string | null; budget: string | null; message: string | null; handledAt: string | null; createdAt: string };

export function LeadsClient() {
  const { data, error, reload } = useFetch<Lead[]>("/api/leads");
  const [show, setShow] = useState<"new" | "all">("new");
  const leads = (data ?? []).filter((l) => show === "all" || !l.handledAt);
  const waNumber = (p: string | null) => (p ? p.replace(/[^\d]/g, "").replace(/^0/, "20") : "");

  const mark = async (l: Lead, handled: boolean) => {
    try { await api(`/api/leads/${l.id}`, { method: "PATCH", body: { handled } }); toast.success(handled ? "Marked as handled" : "Moved back to new"); reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not update"); }
  };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Admin" title="Leads" subtitle="Enquiries from the website's contact form. Every admin is notified when one arrives."
        actions={<Segmented value={show} onChange={setShow} options={[{ key: "new", label: `New · ${(data ?? []).filter((l) => !l.handledAt).length}` }, { key: "all", label: `All · ${data?.length ?? 0}` }]} />} />
      {error && <p className="text-sm text-red-400">{error}</p>}
      {!data ? <Skeleton className="h-64 rounded-2xl" /> : leads.length === 0 ? (
        <Card><EmptyState icon={<Inbox className="h-6 w-6" />} title={show === "new" ? "No new enquiries" : "No enquiries yet"} body="When someone sends the website's contact form, it shows up here." /></Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {leads.map((l) => (
            <Card key={l.id} className={cn("p-4", l.handledAt && "opacity-60")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-fg">{l.fullName}{l.companyName && <span className="font-normal text-muted"> · {l.companyName}</span>}</div>
                  <div className="text-[11px] text-muted">{relative(l.createdAt)}</div>
                </div>
                {l.handledAt ? <Badge color="#10b981">Handled</Badge> : <Badge color="#c1392b">New</Badge>}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {l.service && <Badge color="#8b5cf6">{l.service}</Badge>}
                {l.budget && <Badge color="#f59e0b">{l.budget}</Badge>}
              </div>
              {l.message && <p className="mt-3 whitespace-pre-wrap text-sm text-fg-2">{l.message}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs">
                <a href={`mailto:${l.email}`} className="inline-flex items-center gap-1 text-accent-2 hover:underline"><Mail className="h-3.5 w-3.5" /> {l.email}</a>
                {l.phone && <a href={`tel:${l.phone}`} className="inline-flex items-center gap-1 text-fg-2 hover:underline"><Phone className="h-3.5 w-3.5" /> {l.phone}</a>}
                {l.phone && <a href={`https://wa.me/${waNumber(l.phone)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-emerald-400 hover:underline"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</a>}
                <span className="ml-auto">
                  {l.handledAt
                    ? <Button size="sm" variant="ghost" onClick={() => mark(l, false)}><RotateCcw className="h-3.5 w-3.5" /> Back to new</Button>
                    : <Button size="sm" onClick={() => mark(l, true)}><Check className="h-3.5 w-3.5" /> Mark handled</Button>}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
