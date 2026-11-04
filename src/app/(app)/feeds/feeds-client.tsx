"use client";
import { useState } from "react";
import Link from "next/link";
import { Download, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/client";
import { useFetch } from "@/components/forms";
import { FeedPanel } from "@/components/feed-panel";
import { downloadGrid, type FeedPost } from "@/components/feed-grid";
import { Button, Card, EmptyState, PageHeader, Skeleton } from "@/components/ui";

type Project = { id: string; name: string; kind: string; postCount: number | null; color: string; client: { id: string; name: string } };

/** Every social media project's feed grid in one place (for the social media specialist who publishes them). */
export function FeedsClient() {
  const projects = useFetch<Project[]>("/api/projects");
  const [busy, setBusy] = useState(false);
  const feeds = (projects.data ?? []).filter((p) => p.kind === "SOCIAL_MEDIA");

  const downloadAll = async () => {
    setBusy(true);
    try {
      for (const p of feeds) {
        const f = await api<{ posts: (Omit<FeedPost, "media"> & { media: { id: string }[] })[] }>(`/api/projects/${p.id}/posts`);
        await downloadGrid(f.posts.map((x) => ({ ...x, media: x.media.map((m) => m.id) })), `${p.client.name} ${p.name}`);
      }
      toast.success(`Downloaded ${feeds.length} grid${feeds.length === 1 ? "" : "s"}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Download failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Publish" title="Social feeds" subtitle="Every social media project's grid. Open a post to see its images and links, or download the grids."
        actions={<Button variant="primary" loading={busy} disabled={!feeds.length} onClick={downloadAll}><Download className="h-4 w-4" /> Download all grids</Button>} />
      {!projects.data ? <Skeleton className="h-96 rounded-2xl" /> : feeds.length === 0 ? (
        <Card><EmptyState icon={<LayoutGrid className="h-6 w-6" />} title="No social media projects yet" body="Projects created with the Social media type show up here." /></Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {feeds.map((p) => (
            <div key={p.id} className="space-y-2">
              <div className="flex items-center gap-2 px-1 text-sm">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
                <span className="font-semibold text-fg">{p.client.name}</span><span className="text-muted">·</span>
                <Link href={`/projects/${p.id}`} className="text-fg-2 hover:text-fg hover:underline">{p.name}</Link>
              </div>
              <FeedPanel projectId={p.id} projectName={`${p.client.name} ${p.name}`} postCount={p.postCount} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
