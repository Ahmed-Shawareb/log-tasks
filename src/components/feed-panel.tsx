"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Download, ExternalLink, ImagePlus, LayoutGrid, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, fmtDate } from "@/lib/client";
import { cn } from "@/lib/utils";
import { useFetch } from "./forms";
import { Button, Card, CardHeader, Field, Input, Modal, Progress, Select, Skeleton, Textarea } from "./ui";
import { FeedGrid, KIND_LABEL, KindIcon, downloadGrid, imgUrl, type FeedPost } from "./feed-grid";

type ApiPost = Omit<FeedPost, "media"> & { media: { id: string; position: number }[] };
const toFeed = (p: ApiPost): FeedPost => ({ ...p, media: p.media.map((m) => m.id) });
const KINDS = ["POST", "REEL", "CAROUSEL"] as const;
const HINT = {
  POST: "One image, plus the link to the post once it is live.",
  REEL: "Upload the cover image, add the link to the video and the Drive folder with the cover and video. On the grid it shows with the ▶ mark.",
  CAROUSEL: "Upload the images in order (up to 10) and add the link.",
};

/** The feed grid on a social media project: the account manager clicks a square to fill it. */
export function FeedPanel({ projectId, projectName, postCount }: { projectId: string; projectName: string; postCount: number | null }) {
  const feed = useFetch<{ canEdit: boolean; posts: ApiPost[] }>(`/api/projects/${projectId}/posts`, [postCount]);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const posts = (feed.data?.posts ?? []).map(toFeed);
  const filled = posts.filter((p) => p.media.length || p.link).length;
  const current = feed.data?.posts.find((p) => p.id === open) ?? null;

  return (
    <Card>
      <CardHeader title="Feed" icon={<LayoutGrid className="h-4 w-4" />}
        subtitle={`${filled} of ${posts.length} posts ready · drag a square onto another to swap them · the client sees this grid`}
        action={<Button size="sm" loading={busy} disabled={!posts.length} onClick={async () => {
          setBusy(true);
          try { await downloadGrid(posts, projectName); } catch (e) { toast.error(e instanceof Error ? e.message : "Download failed"); } finally { setBusy(false); }
        }}><Download className="h-4 w-4" /> Download grid</Button>} />
      <div className="px-5 py-4">
        <Progress value={posts.length ? (filled / posts.length) * 100 : 0} className="mb-4 h-1.5" />
        {!feed.data ? <Skeleton className="mx-auto aspect-[3/4] max-w-md" /> : (
          <FeedGrid posts={posts} editable={feed.data.canEdit} className="mx-auto max-w-md" onPick={(p) => setOpen(p.id)}
            onSwap={feed.data.canEdit ? async (from, to) => {
              try { await api(`/api/projects/${projectId}/posts/swap`, { body: { from, to } }); feed.reload(); }
              catch (e) { toast.error(e instanceof Error ? e.message : "Could not move the post"); }
            } : undefined} />
        )}
      </div>
      <PostEditor projectId={projectId} post={current} total={posts.length} others={posts} canEdit={!!feed.data?.canEdit} onClose={() => setOpen(null)} onChanged={feed.reload} />
    </Card>
  );
}

function PostEditor({ projectId, post, total, others, canEdit, onClose, onChanged }: {
  projectId: string; post: ApiPost | null; total: number; others: FeedPost[]; canEdit: boolean; onClose: () => void; onChanged: () => void;
}) {
  const [link, setLink] = useState("");
  const [driveLink, setDriveLink] = useState("");
  const [caption, setCaption] = useState("");
  const [publishAt, setPublishAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [view, setView] = useState(0);
  const file = useRef<HTMLInputElement>(null);
  const postId = post?.id;
  useEffect(() => {
    if (!post) return;
    setLink(post.link ?? ""); setDriveLink(post.driveLink ?? ""); setCaption(post.caption ?? ""); setPublishAt(post.publishAt ? post.publishAt.slice(0, 10) : ""); setView(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);
  if (!post) return <Modal open={false} onClose={onClose} title="">{null}</Modal>;
  const base = `/api/projects/${projectId}/posts/${post.id}`;
  const media = post.media;

  const patch = async (body: Record<string, unknown>, msg?: string) => {
    try { await api(base, { method: "PATCH", body }); if (msg) toast.success(msg); onChanged(); return true; }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); return false; }
  };
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const f of Array.from(files).slice(0, post.kind === "CAROUSEL" ? 10 : 1)) {
        const form = new FormData(); form.append("file", f);
        await api(`${base}/images`, { form });
      }
      onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed"); }
    finally { setUploading(false); if (file.current) file.current.value = ""; }
  };
  const move = (i: number, d: -1 | 1) => {
    const ids = media.map((m) => m.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    patch({ order: ids });
  };
  const remove = async (id: string) => {
    try { await api(`/api/feed-images/${id}`, { method: "DELETE" }); onChanged(); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not remove"); }
  };
  const save = async () => {
    if (post.kind === "REEL" && !link.trim()) { toast.error("Add the link to the reel's video."); return; }
    setSaving(true);
    const ok = await patch({ link: link.trim() || null, driveLink: driveLink.trim() || null, caption: caption || null, publishAt: publishAt ? new Date(`${publishAt}T12:00:00`).toISOString() : null }, `Post ${post.position} saved`);
    setSaving(false);
    if (ok) onClose();
  };
  const shown = media[Math.min(view, media.length - 1)];

  return (
    <Modal open onClose={onClose} size="lg" title={`Post ${post.position}`} subtitle={HINT[post.kind]}
      footer={canEdit ? <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={saving} onClick={save}>Save post</Button></> : <Button onClick={onClose}>Close</Button>}>
      <div className="grid gap-5 md:grid-cols-[1fr_1.1fr]">
        <div>
          <div className="relative aspect-[4/5] overflow-hidden rounded-xl border border-line bg-panel">
            {shown ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imgUrl(shown.id)} alt="" className="h-full w-full object-cover" />
            ) : (
              <button type="button" disabled={!canEdit} onClick={() => file.current?.click()} className="flex h-full w-full flex-col items-center justify-center gap-2 text-sm text-muted hover:text-fg">
                <ImagePlus className="h-7 w-7" /> {post.kind === "REEL" ? "Upload the cover image" : post.kind === "CAROUSEL" ? "Upload the images" : "Upload the image"}
              </button>
            )}
            {post.kind !== "POST" && <span className="absolute right-2 top-2 text-white drop-shadow"><KindIcon kind={post.kind} className="h-5 w-5" /></span>}
            {media.length > 1 && <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1">{media.map((m, i) => <span key={m.id} className={cn("h-1.5 w-1.5 rounded-full", i === view ? "bg-white" : "bg-white/45")} />)}</div>}
          </div>
          {post.kind === "CAROUSEL" && media.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {media.map((m, i) => (
                <div key={m.id} className={cn("relative w-16 overflow-hidden rounded-lg border", i === view ? "border-[var(--accent)]" : "border-line")}>
                  <button type="button" onClick={() => setView(i)} className="block aspect-[4/5] w-full">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imgUrl(m.id)} alt={`Image ${i + 1}`} className="h-full w-full object-cover" />
                  </button>
                  <span className="absolute left-0.5 top-0.5 rounded bg-black/60 px-1 text-[9px] font-bold text-white">{i + 1}</span>
                  {canEdit && <div className="flex justify-between bg-panel-solid">
                    <button type="button" aria-label="Move earlier" className="p-0.5 text-muted hover:text-fg disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)}><ArrowLeft className="h-3 w-3" /></button>
                    <button type="button" aria-label="Remove image" className="p-0.5 text-muted hover:text-red-400" onClick={() => remove(m.id)}><Trash2 className="h-3 w-3" /></button>
                    <button type="button" aria-label="Move later" className="p-0.5 text-muted hover:text-fg disabled:opacity-30" disabled={i === media.length - 1} onClick={() => move(i, 1)}><ArrowRight className="h-3 w-3" /></button>
                  </div>}
                </div>
              ))}
            </div>
          )}
          {canEdit && (
            <div className="mt-3 flex flex-wrap gap-2">
              <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple={post.kind === "CAROUSEL"} hidden onChange={(e) => upload(e.target.files)} />
              <Button size="sm" loading={uploading} onClick={() => file.current?.click()} disabled={post.kind === "CAROUSEL" && media.length >= 10}>
                <ImagePlus className="h-4 w-4" /> {post.kind === "CAROUSEL" ? "Add images" : media.length ? "Replace image" : "Upload image"}
              </Button>
              {post.kind !== "CAROUSEL" && media[0] && <Button size="sm" variant="ghost" onClick={() => remove(media[0]!.id)}><Trash2 className="h-4 w-4" /> Remove</Button>}
            </div>
          )}
        </div>
        <div className="space-y-4">
          {canEdit && total > 1 && (
            <Field label="Position in the grid" hint="Swaps this post with the one at that position (on a computer you can also drag squares).">
              <Select value={post.position} onChange={async (e) => {
                const to = others.find((o) => o.position === Number(e.target.value));
                if (!to || to.id === post.id) return;
                try { await api(`/api/projects/${projectId}/posts/swap`, { body: { from: post.id, to: to.id } }); toast.success(`Moved to position ${to.position}`); onChanged(); onClose(); }
                catch (err) { toast.error(err instanceof Error ? err.message : "Could not move the post"); }
              }}>
                {others.map((o) => <option key={o.id} value={o.position}>{o.position === post.position ? `${o.position} (here)` : `${o.position} · swap with ${KIND_LABEL[o.kind].toLowerCase()}${o.media.length ? "" : " (empty)"}`}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Type">
            <div className="grid grid-cols-3 gap-2">
              {KINDS.map((k) => (
                <button key={k} type="button" disabled={!canEdit} onClick={() => k !== post.kind && patch({ kind: k })}
                  className={cn("flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-sm transition", post.kind === k ? "border-[var(--accent)] bg-accent-soft font-semibold text-fg" : "border-line text-muted hover:border-line-strong hover:text-fg")}>
                  <KindIcon kind={k} className="h-3.5 w-3.5" />{KIND_LABEL[k]}
                </button>
              ))}
            </div>
            {post.kind !== "CAROUSEL" && media.length > 1 && <p className="mt-1 text-[11px] text-muted">Only the first image is kept.</p>}
          </Field>
          <Field label={post.kind === "REEL" ? "Video link" : "Post link"} hint={post.kind === "REEL" ? "Instagram, TikTok, YouTube, Google Drive… The client opens it from the grid." : "Optional until the post is live."}>
            <Input type="url" disabled={!canEdit} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" />
          </Field>
          {post.kind === "REEL" && (
            <Field label="Drive link (cover + video)" hint="The Google Drive folder with the cover and the video together.">
              <Input type="url" disabled={!canEdit} value={driveLink} onChange={(e) => setDriveLink(e.target.value)} placeholder="https://drive.google.com/..." />
            </Field>
          )}
          <div className="flex flex-wrap gap-3">
            {post.link && <a href={post.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-accent-2 hover:underline"><ExternalLink className="h-3 w-3" /> Open {post.kind === "REEL" ? "video" : "link"}</a>}
            {post.kind === "REEL" && post.driveLink && <a href={post.driveLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-accent-2 hover:underline"><ExternalLink className="h-3 w-3" /> Open Drive</a>}
          </div>
          <Field label="Goes live on" hint="Shown to the client on their calendar."><Input type="date" disabled={!canEdit} value={publishAt} onChange={(e) => setPublishAt(e.target.value)} /></Field>
          <Field label="Caption"><Textarea disabled={!canEdit} value={caption} onChange={(e) => setCaption(e.target.value)} className="min-h-[90px]" /></Field>
          {post.publishAt && <p className="text-[11px] text-muted">Planned for {fmtDate(post.publishAt, { weekday: "short", day: "numeric", month: "short" })}</p>}
        </div>
      </div>
    </Modal>
  );
}
