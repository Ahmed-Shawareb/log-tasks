"use client";
import { useState } from "react";
import { Layers, Play, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

// The feed grid of a social media project, drawn like an Instagram / TikTok profile (3 across, 4:5 squares).
// Used by the account manager (to fill it) and on the client dashboard (to preview the final profile).

export type FeedPost = {
  id: string; position: number; kind: "POST" | "REEL" | "CAROUSEL"; link: string | null; driveLink?: string | null; caption: string | null; publishAt: string | null; media: string[];
};
export const imgUrl = (id: string) => `/api/feed-images/${id}`;
export const KIND_LABEL = { POST: "Post", REEL: "Reel", CAROUSEL: "Carousel" } as const;

export function KindIcon({ kind, className }: { kind: FeedPost["kind"]; className?: string }) {
  if (kind === "REEL") return <Play className={cn("fill-current", className)} />;
  if (kind === "CAROUSEL") return <Layers className={className} />;
  return null;
}

/**
 * Squares in profile order: like a real feed, post 1 (the oldest) is at the bottom right and the numbers count up
 * toward the top left. When the count isn't a multiple of 3 the top row starts with empty space (null).
 */
export function gridSlots<T extends { position: number }>(posts: T[]): (T | null)[] {
  const newestFirst = [...posts].sort((a, b) => b.position - a.position);
  return [...Array<null>((3 - (posts.length % 3)) % 3).fill(null), ...newestFirst];
}

/** `onSwap`: drag a square onto another one and they change places. */
export function FeedGrid({ posts, onPick, onSwap, editable, className }: { posts: FeedPost[]; onPick?: (p: FeedPost) => void; onSwap?: (fromId: string, toId: string) => void; editable?: boolean; className?: string }) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  return (
    <div className={cn("grid grid-cols-3 gap-[3px] overflow-hidden rounded-xl bg-[var(--line)]", className)}>
      {gridSlots(posts).map((p, i) => {
        if (!p) return <div key={`gap-${i}`} aria-hidden className="aspect-[4/5] bg-panel-solid/40" />;
        const cover = p.media[0];
        return (
          <button key={p.id} type="button" onClick={() => onPick?.(p)} disabled={!onPick}
            draggable={!!onSwap}
            onDragStart={onSwap ? (e) => { setDragId(p.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", p.id); } : undefined}
            onDragOver={onSwap ? (e) => { if (dragId && dragId !== p.id) { e.preventDefault(); setOverId(p.id); } } : undefined}
            onDragLeave={onSwap ? () => setOverId((o) => (o === p.id ? null : o)) : undefined}
            onDrop={onSwap ? (e) => { e.preventDefault(); const from = dragId ?? e.dataTransfer.getData("text/plain"); setDragId(null); setOverId(null); if (from && from !== p.id) onSwap(from, p.id); } : undefined}
            onDragEnd={onSwap ? () => { setDragId(null); setOverId(null); } : undefined}
            title={onSwap ? "Click to edit · drag onto another square to swap them" : undefined}
            className={cn("group relative aspect-[4/5] overflow-hidden bg-panel-solid text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]", onPick && "cursor-pointer",
              dragId === p.id && "opacity-40", overId === p.id && "ring-4 ring-inset ring-[var(--accent)]")}
            aria-label={`${KIND_LABEL[p.kind]} ${p.position}${cover ? "" : " (empty)"}`}>
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imgUrl(cover)} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1 border border-dashed border-line-strong text-muted">
                {editable ? <Plus className="h-5 w-5" /> : null}
                <span className="text-[11px] tabular-nums">{p.position}</span>
                {p.link && <span className="text-[10px]">link added</span>}
              </div>
            )}
            {p.kind !== "POST" && (
              <span className="absolute right-1.5 top-1.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,.7)]"><KindIcon kind={p.kind} className="h-4 w-4" /></span>
            )}
            {onPick && cover && <span className="absolute inset-0 bg-black/0 transition group-hover:bg-black/15" />}
          </button>
        );
      })}
    </div>
  );
}

/** Draws the whole grid into one PNG and downloads it. */
export async function downloadGrid(posts: FeedPost[], fileName: string) {
  const W = 1080, gap = 6, cols = 3;
  const cw = (W - gap * (cols - 1)) / cols, ch = (cw * 5) / 4;
  const slots = gridSlots(posts);
  const rows = Math.ceil(slots.length / cols);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = Math.max(1, Math.round(rows * ch + (rows - 1) * gap));
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, canvas.width, canvas.height);
  const load = async (id: string) => {
    const r = await fetch(imgUrl(id), { credentials: "same-origin" });
    if (!r.ok) return null;
    return createImageBitmap(await r.blob());
  };
  const images = await Promise.all(slots.map((p) => (p?.media[0] ? load(p.media[0]).catch(() => null) : Promise.resolve(null))));
  slots.forEach((p, i) => {
    if (!p) return; // the empty start of the top row
    const x = (i % cols) * (cw + gap), y = Math.floor(i / cols) * (ch + gap);
    const img = images[i];
    if (img) {
      const s = Math.max(cw / img.width, ch / img.height);
      const sw = cw / s, sh = ch / s;
      g.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, cw, ch);
    } else {
      g.fillStyle = "#eef0f4";
      g.fillRect(x, y, cw, ch);
      g.fillStyle = "#9aa1ad";
      g.font = "600 28px Inter, system-ui, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(String(p.position), x + cw / 2, y + ch / 2);
    }
    if (p.kind !== "POST") {
      g.save();
      g.shadowColor = "rgba(0,0,0,.55)";
      g.shadowBlur = 6;
      g.fillStyle = "#ffffff";
      g.strokeStyle = "#ffffff";
      g.lineWidth = 4;
      const ix = x + cw - 44, iy = y + 16;
      if (p.kind === "REEL") {
        g.beginPath(); g.moveTo(ix + 6, iy); g.lineTo(ix + 30, iy + 14); g.lineTo(ix + 6, iy + 28); g.closePath(); g.fill();
      } else {
        g.strokeRect(ix + 8, iy, 22, 22);
        g.beginPath(); g.moveTo(ix + 2, iy + 6); g.lineTo(ix + 2, iy + 28); g.lineTo(ix + 24, iy + 28); g.stroke();
      }
      g.restore();
    }
  });
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  if (!blob) throw new Error("Could not create the image");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${fileName.replace(/[^\w\- ]+/g, "").trim() || "feed"}-grid.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
