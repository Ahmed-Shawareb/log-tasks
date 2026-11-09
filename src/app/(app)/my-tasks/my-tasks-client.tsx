"use client";
import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, ClipboardList, Flag, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { api, fmtDate, qs } from "@/lib/client";
import { cn, isOverdue, taskRef } from "@/lib/utils";
import type { TaskItem } from "@/lib/types";
import { useApp } from "@/components/app-context";
import { FeedPanel } from "@/components/feed-panel";
import { leftLabel } from "../my-calendar/my-calendar-client";
import { Card, EmptyState, Modal, PageHeader, Segmented, Skeleton, StatusBadge } from "@/components/ui";

// An external's list of everything given to them: to do, waiting for review, and done.

type Filter = "open" | "review" | "done" | "all";
const IN: Record<Filter, (s: string) => boolean> = {
  open: (s) => !["SUBMITTED", "APPROVED", "CANCELLED"].includes(s),
  review: (s) => s === "SUBMITTED",
  done: (s) => s === "APPROVED",
  all: (s) => s !== "CANCELLED",
};

export function MyTasksClient() {
  const { user, openTask, dataVersion } = useApp();
  const [items, setItems] = useState<TaskItem[] | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [grid, setGrid] = useState<TaskItem | null>(null);
  useEffect(() => {
    api<{ items: TaskItem[] }>(`/api/tasks${qs({ assigneeId: user.id, pageSize: 300, sort: "due", plans: "1" })}`)
      .then((r) => setItems(r.items)).catch((e) => toast.error(e instanceof Error ? e.message : "Could not load your tasks"));
  }, [user.id, dataVersion]);
  const shown = useMemo(() => (items ?? []).filter((t) => IN[filter](t.status)), [items, filter]);
  const count = (f: Filter) => (items ?? []).filter((t) => IN[f](t.status)).length;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Your work" title="Tasks" subtitle="Everything given to you. Open a task to start it, add files or links, and submit."
        actions={<Segmented value={filter} onChange={setFilter} options={[
          { key: "open", label: `To do · ${count("open")}` }, { key: "review", label: `In review · ${count("review")}` },
          { key: "done", label: `Done · ${count("done")}` }, { key: "all", label: "All" },
        ]} />} />
      {!items ? <Skeleton className="h-96 rounded-2xl" /> : shown.length === 0 ? (
        <Card><EmptyState icon={<ClipboardList className="h-6 w-6" />} title={filter === "open" ? "Nothing to do right now" : "Nothing here"} body="New tasks show up here as soon as they're given to you." /></Card>
      ) : (
        <Card>
          <ul className="divide-y divide-[var(--line)]">
            {shown.map((t) => {
              const late = !!(t.plannedAt && t.dueAt && new Date(t.plannedAt) > new Date(t.dueAt));
              return (
                <li key={t.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="mt-1 h-9 w-1 shrink-0 rounded-full" style={{ background: t.project?.color ?? "var(--accent)" }} />
                  <button type="button" onClick={() => openTask(t.id)} className="min-w-0 flex-1 text-left">
                    <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                      <span className="font-mono">{taskRef(t.number)}</span>
                      {t.project && <span className="truncate">{t.project.client.name} · {t.project.name}</span>}
                    </div>
                    <div className="mt-0.5 text-sm font-medium text-fg">{t.title}</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <StatusBadge status={t.status} />
                      {t.dueAt && <span className={cn("inline-flex items-center gap-1", isOverdue(t) ? "text-red-400" : "text-fg-2")}><Flag className="h-3 w-3" /> Due {fmtDate(t.dueAt)}</span>}
                      {t.plannedAt
                        ? <span className={cn("inline-flex items-center gap-1", late ? "text-red-400" : "text-sky-400")}><CalendarCheck className="h-3 w-3" /> Planned {fmtDate(t.plannedAt)}</span>
                        : t.quantity !== null && t._count.children > 0 ? <span className="text-accent-2">{leftLabel(t)}</span>
                        : IN.open(t.status) && <span className="text-muted">Not planned yet</span>}
                    </div>
                  </button>
                  {t.project?.kind === "SOCIAL_MEDIA" && IN.open(t.status) && (
                    <button type="button" onClick={() => setGrid(t)} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-accent-soft px-2 py-1 text-xs font-semibold text-accent-2"><LayoutGrid className="h-3.5 w-3.5" /> Grid</button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      <Modal open={!!grid} onClose={() => setGrid(null)} size="xl" title={grid?.project?.name ?? "Grid"} subtitle={grid?.title}>
        {grid?.project && <FeedPanel projectId={grid.project.id} projectName={grid.project.name} postCount={null} />}
      </Modal>
    </div>
  );
}
