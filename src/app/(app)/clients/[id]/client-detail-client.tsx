"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ban, Briefcase, Mail, Pencil, Phone, Plus } from "lucide-react";
import { humanize } from "@/lib/constants";
import { fmtDate } from "@/lib/client";
import { useApp } from "@/components/app-context";
import { useFetch } from "@/components/forms";
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { ClientFormModal } from "../client-form";
import { CLIENT_STATUS_COLOR, type ClientRow } from "../clients-client";
import { ProjectFormModal } from "../../projects/project-form";
import { PROJECT_STATUS_COLOR } from "../../projects/projects-client";

type Detail = Omit<ClientRow, "projects" | "_count"> & {
  projects: { id: string; name: string; status: string; targetDate: string | null; color: string; accountManager: { name: string } | null; _count: { tasks: number } }[];
};

export function ClientDetailClient({ id }: { id: string }) {
  const { user } = useApp();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [newProject, setNewProject] = useState(false);
  const { data: c, error, reload } = useFetch<Detail>(`/api/clients/${id}`);
  if (error) return <Card><EmptyState icon={<Ban className="h-6 w-6" />} title="Client unavailable" body={error} action={<Link href="/clients"><Button>Back</Button></Link>} /></Card>;
  if (!c) return <div className="space-y-4"><Skeleton className="h-10 w-1/3" /><Skeleton className="h-48" /></div>;
  const canEdit = user.role === "ADMIN" || (user.role === "ACCOUNT_MANAGER" && c.accountManagerId === user.id);

  return (
    <div className="space-y-5">
      <Link href="/clients" className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg"><ArrowLeft className="h-3.5 w-3.5" /> All clients</Link>
      <PageHeader eyebrow={c.industry ?? "Client"} title={c.name}
        subtitle={<Badge color={CLIENT_STATUS_COLOR[c.status]} dot>{humanize(c.status)}</Badge>}
        actions={canEdit && <>
          <Button size="sm" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Edit</Button>
          <Button size="sm" variant="primary" onClick={() => setNewProject(true)}><Plus className="h-4 w-4" /> New project</Button>
        </>} />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Contact" />
          <div className="space-y-2 px-5 py-4 text-sm text-fg-2">
            <div className="font-medium text-fg">{c.contactName ?? "No contact person"}</div>
            {c.contactEmail && <a href={`mailto:${c.contactEmail}`} className="flex items-center gap-2 text-accent-2 hover:underline"><Mail className="h-4 w-4" />{c.contactEmail}</a>}
            {c.contactPhone && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted" />{c.contactPhone}</div>}
            {c.accountManager && <div className="flex items-center gap-2 pt-2 text-xs text-muted">Account manager <Avatar name={c.accountManager.name} color={c.accountManager.avatarColor} size={20} /><span className="text-fg-2">{c.accountManager.name}</span></div>}
          </div>
          <div className="border-t border-line px-5 py-4">
            <div className="mb-1 text-xs font-medium uppercase tracking-wider text-muted">Notes</div>
            <p className="whitespace-pre-wrap text-sm text-fg-2">{c.notes || <span className="text-muted">No notes.</span>}</p>
          </div>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Projects" subtitle={`${c.projects.length} visible to you`} icon={<Briefcase className="h-4 w-4" />} />
          {c.projects.length === 0 ? <EmptyState icon={<Briefcase className="h-6 w-6" />} title="No projects yet" /> : (
            <ul className="divide-y divide-[var(--line)]">
              {c.projects.map((p) => (
                <li key={p.id}>
                  <Link href={`/projects/${p.id}`} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-panel-hover">
                    <span className="h-8 w-1 rounded-full" style={{ background: p.color }} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-fg">{p.name}</span><span className="text-[11px] text-muted">{p._count.tasks} tasks{p.accountManager ? ` · ${p.accountManager.name}` : ""}</span></span>
                    <span className="text-xs text-muted">{fmtDate(p.targetDate)}</span>
                    <Badge color={PROJECT_STATUS_COLOR[p.status]} dot>{humanize(p.status)}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <ClientFormModal open={editing} client={c} onClose={() => setEditing(false)} onSaved={reload} />
      <ProjectFormModal open={newProject} defaultClientId={c.id} onClose={() => setNewProject(false)} onSaved={(p) => router.push(`/projects/${p.id}`)} />
    </div>
  );
}
