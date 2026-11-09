"use client";
import { useEffect, useMemo, useState } from "react";
import { LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { api, qs } from "@/lib/client";
import type { TaskItem } from "@/lib/types";
import { useApp } from "@/components/app-context";
import { FeedPanel } from "@/components/feed-panel";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui";

// Every feed grid an external can work on: the social media projects of the tasks still open for them.

const OPEN = "BACKLOG,READY,SCHEDULED,IN_PROGRESS,CHANGES_REQUESTED,BLOCKED,ON_HOLD,SUBMITTED";

export function MyGridsClient() {
  const { user, dataVersion } = useApp();
  const [items, setItems] = useState<TaskItem[] | null>(null);
  useEffect(() => {
    api<{ items: TaskItem[] }>(`/api/tasks${qs({ assigneeId: user.id, status: OPEN, pageSize: 300, plans: "1" })}`)
      .then((r) => setItems(r.items)).catch((e) => toast.error(e instanceof Error ? e.message : "Could not load your grids"));
  }, [user.id, dataVersion]);
  const projects = useMemo(() => {
    const m = new Map<string, NonNullable<TaskItem["project"]> & { tasks: string[] }>();
    for (const t of items ?? []) {
      if (t.project?.kind !== "SOCIAL_MEDIA") continue;
      const p = m.get(t.project.id) ?? { ...t.project, tasks: [] };
      p.tasks.push(t.title);
      m.set(t.project.id, p);
    }
    return [...m.values()];
  }, [items]);

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Your work" title="Grids" subtitle="The feed grids of the social media projects you're working on. Click a square to add its images and links." />
      {!items ? <Skeleton className="h-96 rounded-2xl" /> : projects.length === 0 ? (
        <Card><EmptyState icon={<LayoutGrid className="h-6 w-6" />} title="No grids right now" body="When you're given a task in a social media project, its grid shows up here." /></Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {projects.map((p) => (
            <div key={p.id} className="space-y-2">
              <div className="flex items-center gap-2 px-1 text-sm">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
                <span className="font-semibold text-fg">{p.client.name}</span><span className="text-muted">·</span><span className="text-fg-2">{p.name}</span>
              </div>
              <p className="px-1 text-[11px] text-muted">Your tasks here: {p.tasks.join(" · ")}</p>
              <FeedPanel projectId={p.id} projectName={`${p.client.name} ${p.name}`} postCount={null} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
