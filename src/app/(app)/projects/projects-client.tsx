"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Briefcase, CalendarDays, Plus, Search } from "lucide-react";
import { PROJECT_STATUSES, humanize } from "@/lib/constants";
import { fmtDate, qs } from "@/lib/client";
import { useApp } from "@/components/app-context";
import { useFetch } from "@/components/forms";
import { Avatar, Badge, Button, Card, EmptyState, Input, PageHeader, PriorityBadge, Progress, Select, Skeleton, Stagger, StaggerItem } from "@/components/ui";
import { ProjectFormModal } from "./project-form";

type Project = {
  id: string; name: string; color: string; status: string; priority: string; targetDate: string | null; startDate: string | null;
  client: { id: string; name: string }; accountManager: { id: string; name: string; avatarColor: string } | null;
  taskTotal: number; taskDone: number; progress: number;
};

export const PROJECT_STATUS_COLOR: Record<string, string> = { PLANNING: "#38bdf8", ACTIVE: "#10b981", ON_HOLD: "#94a3b8", COMPLETED: "#a855f7", ARCHIVED: "#475569" };

export function ProjectsClient() {
  const { user } = useApp();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const { data, error, loading } = useFetch<Project[]>(`/api/projects${qs({ q, status })}`);
  const canCreate = user.role === "ADMIN" || user.role === "ACCOUNT_MANAGER";

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Agency" title="Projects" subtitle={data ? `${data.length} project${data.length === 1 ? "" : "s"}` : "Loading…"}
        actions={canCreate && <Button variant="primary" size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New project</Button>} />
      <div className="glass flex flex-wrap gap-2 rounded-2xl p-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects or clients" className="pl-9" aria-label="Search projects" />
        </div>
        <Select className="w-auto min-w-40" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All except archived</option>
          {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
        </Select>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {loading && !data && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44" />)}</div>}
      {data && data.length === 0 && <Card><EmptyState icon={<Briefcase className="h-6 w-6" />} title="No projects" body={canCreate ? "Create a project for a client to start planning work." : "Projects you have work in appear here."} /></Card>}
      {data && data.length > 0 && (
        <Stagger className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((p) => (
            <StaggerItem key={p.id}>
              <Link href={`/projects/${p.id}`} className="block h-full">
                <Card hover className="relative h-full overflow-hidden p-5">
                  <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-25 blur-2xl" style={{ background: p.color }} />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-xs text-muted">{p.client.name}</div>
                      <h3 className="mt-0.5 truncate text-base font-semibold text-fg">{p.name}</h3>
                    </div>
                    <Badge color={PROJECT_STATUS_COLOR[p.status]} dot>{humanize(p.status)}</Badge>
                  </div>
                  <div className="mt-4 space-y-1.5">
                    <div className="flex justify-between text-xs text-muted"><span>{p.taskDone}/{p.taskTotal} tasks approved</span><span className="tabular-nums">{p.progress}%</span></div>
                    <Progress value={p.progress} color={p.color} />
                  </div>
                  <div className="mt-4 flex items-center gap-3 text-xs text-muted">
                    <PriorityBadge priority={p.priority} />
                    {p.targetDate && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> {fmtDate(p.targetDate)}</span>}
                    {p.accountManager && <span className="ml-auto inline-flex items-center gap-1.5"><Avatar name={p.accountManager.name} color={p.accountManager.avatarColor} size={20} />{p.accountManager.name}</span>}
                  </div>
                </Card>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      )}
      <ProjectFormModal open={creating} onClose={() => setCreating(false)} onSaved={(p) => router.push(`/projects/${p.id}`)} />
    </div>
  );
}
