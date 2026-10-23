"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Ban, Building2, CalendarDays, CheckCircle2, ClipboardList, Flame, ListTodo, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { PROJECT_STATUSES, STATUS_META, humanize, type StatusKey } from "@/lib/constants";
import { api, fmtDate } from "@/lib/client";
import { isOverdue, taskRef } from "@/lib/utils";
import type { TaskItem } from "@/lib/types";
import { useApp } from "@/components/app-context";
import { useFetch } from "@/components/forms";
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, OverdueBadge, PageHeader, PriorityBadge, Progress, Select, Skeleton, StatusBadge } from "@/components/ui";
import { ProjectFormModal, type ProjectInput } from "../project-form";
import { PROJECT_STATUS_COLOR } from "../projects-client";

type Project = ProjectInput & {
  id: string; client: { id: string; name: string; contactName: string | null; contactEmail: string | null };
  accountManager: { id: string; name: string; avatarColor: string; email: string } | null;
};

export function ProjectDetailClient({ id }: { id: string }) {
  const { user, openTask, openCreate, dataVersion, isManager } = useApp();
  const [editing, setEditing] = useState(false);
  const project = useFetch<Project>(`/api/projects/${id}`);
  const tasks = useFetch<{ items: TaskItem[]; total: number }>(`/api/tasks?projectId=${id}&pageSize=300&sort=status`, [dataVersion]);
  const canEdit = user.role === "ADMIN" || (user.role === "ACCOUNT_MANAGER" && project.data?.accountManagerId === user.id);

  const stats = useMemo(() => {
    const items = tasks.data?.items ?? [];
    const live = items.filter((t) => t.status !== "CANCELLED");
    const done = live.filter((t) => t.status === "APPROVED").length;
    return {
      total: live.length, done, progress: live.length ? Math.round((done / live.length) * 100) : 0,
      overdue: items.filter((t) => isOverdue(t)).length, blocked: items.filter((t) => t.status === "BLOCKED").length,
      review: items.filter((t) => t.status === "SUBMITTED").length,
    };
  }, [tasks.data]);

  if (project.error) return <Card><EmptyState icon={<Ban className="h-6 w-6" />} title="Project unavailable" body={project.error} action={<Link href="/projects"><Button>Back to projects</Button></Link>} /></Card>;
  if (!project.data) return <div className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-40" /><Skeleton className="h-64" /></div>;
  const p = project.data;

  const setStatus = async (status: string) => {
    try { await api(`/api/projects/${p.id}`, { method: "PATCH", body: { status } }); toast.success(`Project marked ${humanize(status).toLowerCase()}`); project.reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Update failed"); }
  };

  return (
    <div className="space-y-5">
      <Link href="/projects" className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg"><ArrowLeft className="h-3.5 w-3.5" /> All projects</Link>
      <PageHeader
        eyebrow={<span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: p.color }} />{p.client.name}</span>}
        title={p.name}
        subtitle={<span className="inline-flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> {fmtDate(p.startDate)} → {fmtDate(p.targetDate)}</span>
          {p.accountManager && <span className="inline-flex items-center gap-1.5"><Avatar name={p.accountManager.name} color={p.accountManager.avatarColor} size={18} /> {p.accountManager.name}</span>}
        </span>}
        actions={<>
          {canEdit ? (
            <Select aria-label="Project status" className="h-9 w-auto" value={p.status} onChange={(e) => setStatus(e.target.value)}>
              {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
            </Select>
          ) : <Badge color={PROJECT_STATUS_COLOR[p.status]} dot>{humanize(p.status)}</Badge>}
          {canEdit && <Button size="sm" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Edit</Button>}
          {isManager && <Button size="sm" variant="primary" onClick={() => openCreate({ projectId: p.id })}><Plus className="h-4 w-4" /> Add task</Button>}
        </>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Progress", value: `${stats.progress}%`, icon: CheckCircle2, color: "#10b981", extra: <Progress value={stats.progress} color={p.color} className="mt-2" /> },
          { label: "Tasks", value: `${stats.done}/${stats.total}`, icon: ListTodo, color: "#38bdf8" },
          { label: "Awaiting review", value: stats.review, icon: ClipboardList, color: "#f59e0b" },
          { label: "Overdue", value: stats.overdue, icon: Flame, color: "#ef4444" },
          { label: "Blocked", value: stats.blocked, icon: Ban, color: "#f43f5e" },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <div className="flex items-center justify-between text-xs text-muted">{s.label}<s.icon className="h-4 w-4" style={{ color: s.color }} /></div>
            <div className="mt-2 font-display text-3xl font-bold tabular-nums">{s.value}</div>
            {s.extra}
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Tasks" subtitle={`${tasks.data?.total ?? 0} in this project`} icon={<ClipboardList className="h-4 w-4" />} />
          {!tasks.data && <div className="space-y-2 p-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>}
          {tasks.data && tasks.data.items.length === 0 && <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="No tasks yet" body="Add the first task to break the project down." />}
          <ul className="divide-y divide-[var(--line)]">
            {tasks.data?.items.map((t) => (
              <li key={t.id}>
                <button onClick={() => openTask(t.id)} className="flex w-full items-center gap-3 px-5 py-2.5 text-left text-sm hover:bg-panel-hover">
                  <span className="w-16 shrink-0 font-mono text-[11px] text-muted">{taskRef(t.number)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-fg">{t.parent ? <span className="text-muted">↳ </span> : null}{t.title}</span>
                    {t.department && <span className="text-[11px] text-muted">{t.department.name}</span>}
                  </span>
                  {isOverdue(t) && <OverdueBadge />}
                  <span className="hidden text-xs text-muted md:inline">{fmtDate(t.dueAt)}</span>
                  <PriorityBadge priority={t.priority} compact />
                  <StatusBadge status={t.status} />
                  {t.assignee ? <Avatar name={t.assignee.name} color={t.assignee.avatarColor} size={22} /> : <span className="w-[22px]" />}
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Client" icon={<Building2 className="h-4 w-4" />} action={user.role !== "EMPLOYEE" && <Link href={`/clients/${p.client.id}`} className="text-xs text-accent-2 hover:underline">Open</Link>} />
            <div className="space-y-1 px-5 py-4 text-sm text-fg-2">
              <div className="font-medium text-fg">{p.client.name}</div>
              {p.client.contactName && <div>{p.client.contactName}</div>}
              {p.client.contactEmail && <a href={`mailto:${p.client.contactEmail}`} className="text-accent-2 hover:underline">{p.client.contactEmail}</a>}
            </div>
          </Card>
          <Card>
            <CardHeader title="Requirements" />
            <div className="whitespace-pre-wrap px-5 py-4 text-sm leading-relaxed text-fg-2">{p.requirements || <span className="text-muted">No requirements recorded.</span>}</div>
          </Card>
          {p.description && <Card><CardHeader title="Description" /><div className="whitespace-pre-wrap px-5 py-4 text-sm text-fg-2">{p.description}</div></Card>}
          {p.notes && <Card><CardHeader title="Internal notes" /><div className="whitespace-pre-wrap px-5 py-4 text-sm text-fg-2">{p.notes}</div></Card>}
          <Card>
            <CardHeader title="Status breakdown" />
            <div className="flex flex-wrap gap-2 px-5 py-4">
              {Object.entries((tasks.data?.items ?? []).reduce<Record<string, number>>((a, t) => ({ ...a, [t.status]: (a[t.status] ?? 0) + 1 }), {})).map(([s, n]) => (
                <Badge key={s} color={STATUS_META[s as StatusKey].color} dot>{STATUS_META[s as StatusKey].label} · {n}</Badge>
              ))}
            </div>
          </Card>
        </div>
      </div>
      <ProjectFormModal open={editing} onClose={() => setEditing(false)} onSaved={() => project.reload()} project={p} />
    </div>
  );
}
