import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { forbidden, invalid, notFound } from "../errors";
import { activity } from "../audit";
import { isAdmin, isSocialSpecialist, projectScope, type SessionUser } from "../permissions";
import { MAX_UPLOAD_BYTES, deleteObject, getObject, putObject, sniffOk } from "./files";

// Social media projects: a feed grid (like an Instagram / TikTok profile) with one square per planned post.
// Each square is a post (one image), a reel (cover image + link to the video) or a carousel (several images in order).
// Videos are not uploaded: uploads are capped at a few MB (Vercel's request limit), so a reel links to where the video lives.

type Tx = Prisma.TransactionClient;
export const MAX_POSTS = 120;
export const MAX_CAROUSEL = 10;
const IMAGE_TYPES: Record<string, string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif" };

export const feedInclude = { media: { orderBy: { position: "asc" }, select: { id: true, position: true, mimeType: true } } } satisfies Prisma.SocialPostInclude;

/** Make the grid hold exactly `count` squares: add empty ones at the end, or drop empty ones from the end. */
export async function syncPostSlots(tx: Tx, projectId: string, count: number) {
  const posts = await tx.socialPost.findMany({ where: { projectId }, include: { _count: { select: { media: true } } }, orderBy: { position: "asc" } });
  const have = posts.length;
  if (count > have) {
    await tx.socialPost.createMany({ data: Array.from({ length: count - have }, (_, i) => ({ projectId, position: have + i + 1 })) });
  } else if (count < have) {
    const extra = posts.slice(count);
    const used = extra.filter((p) => p._count.media || p.link || p.caption);
    if (used.length) throw invalid(`Post ${used[0]!.position} already has content. Clear it before lowering the number of posts to ${count}.`);
    await tx.socialPost.deleteMany({ where: { id: { in: extra.map((p) => p.id) } } });
  }
}

/** Someone given a live task in the project (an external, a designer…) works on its feed through that task. */
const workingOn = (actor: SessionUser, projectId: string) =>
  db.task.count({ where: { projectId, assigneeId: actor.id, archivedAt: null, status: { notIn: ["APPROVED", "CANCELLED"] } } }).then((n) => n > 0);

async function projectFor(actor: SessionUser, projectId: string) {
  const sel = { id: true, kind: true, accountManagerId: true, name: true } as const;
  let p = await db.project.findFirst({ where: { AND: [{ id: projectId }, projectScope(actor)] }, select: sel });
  let assigned = false;
  if (!p && (await workingOn(actor, projectId))) { p = await db.project.findUnique({ where: { id: projectId }, select: sel }); assigned = true; }
  if (!p) throw notFound("Project");
  if (p.kind !== "SOCIAL_MEDIA") throw invalid("This is not a social media project.");
  return { ...p, assigned: assigned || (await workingOn(actor, projectId)) };
}

// The social media specialist publishes the posts, so they can also fill in links and dates.
const canEditFeed = (actor: SessionUser, p: { accountManagerId: string | null; assigned?: boolean }) =>
  isAdmin(actor) || isSocialSpecialist(actor) || p.accountManagerId === actor.id || !!p.assigned;

export async function getFeed(actor: SessionUser, projectId: string) {
  const p = await projectFor(actor, projectId);
  const posts = await db.socialPost.findMany({ where: { projectId }, include: feedInclude, orderBy: { position: "asc" } });
  return { canEdit: canEditFeed(actor, p), posts };
}

const httpUrl = z.string().trim().max(2000).url().refine((u) => /^https?:\/\//i.test(u), "Links must start with http:// or https://");

export const postSchema = z.object({
  kind: z.enum(["POST", "REEL", "CAROUSEL"]).optional(),
  link: httpUrl.nullable().optional().or(z.literal("").transform(() => null)),
  driveLink: httpUrl.nullable().optional().or(z.literal("").transform(() => null)),
  caption: z.string().max(2200).nullable().optional(),
  publishAt: z.string().datetime({ offset: true }).nullable().optional(),
  /** Image ids in the order they should show (carousel). */
  order: z.array(z.string()).max(MAX_CAROUSEL).optional(),
});

async function postFor(actor: SessionUser, projectId: string, postId: string) {
  const p = await projectFor(actor, projectId);
  if (!canEditFeed(actor, p)) throw forbidden("Only the project's account manager can change the feed.");
  const post = await db.socialPost.findFirst({ where: { id: postId, projectId }, include: { media: { orderBy: { position: "asc" } } } });
  if (!post) throw notFound("Post");
  return { project: p, post };
}

export async function updatePost(actor: SessionUser, projectId: string, postId: string, raw: unknown) {
  const input = postSchema.parse(raw);
  const { post } = await postFor(actor, projectId, postId);
  return db.$transaction(async (tx) => {
    if (input.order) {
      const ids = post.media.map((m) => m.id);
      if (input.order.length !== ids.length || !input.order.every((id) => ids.includes(id))) throw invalid("The image order does not match this post's images.");
      for (const [i, id] of input.order.entries()) await tx.socialMedia.update({ where: { id }, data: { position: i } });
    }
    // A post or reel shows one image: switching away from a carousel keeps the first.
    if (input.kind && input.kind !== "CAROUSEL" && post.media.length > 1) {
      const keep = (input.order ?? post.media.map((m) => m.id))[0];
      const drop = post.media.filter((m) => m.id !== keep);
      await tx.socialMedia.deleteMany({ where: { id: { in: drop.map((m) => m.id) } } });
      for (const m of drop) await deleteObject(m.storageKey);
    }
    const updated = await tx.socialPost.update({
      where: { id: post.id },
      data: {
        kind: input.kind, link: input.link, driveLink: input.driveLink, caption: input.caption === undefined ? undefined : input.caption?.trim() || null,
        publishAt: input.publishAt === undefined ? undefined : input.publishAt ? new Date(input.publishAt) : null,
      },
      include: feedInclude,
    });
    await activity(tx, actor.id, "feed.post_updated", { projectId }, { position: post.position, kind: updated.kind });
    return updated;
  });
}

/** Drag and drop on the grid: the two squares change places (content, type, links and images move together). */
export async function swapPosts(actor: SessionUser, projectId: string, fromId: string, toId: string) {
  const p = await projectFor(actor, projectId);
  if (!canEditFeed(actor, p)) throw forbidden("Only the project's account manager can change the feed.");
  if (fromId === toId) return { ok: true };
  return db.$transaction(async (tx) => {
    const [a, b] = await Promise.all([tx.socialPost.findFirst({ where: { id: fromId, projectId } }), tx.socialPost.findFirst({ where: { id: toId, projectId } })]);
    if (!a || !b) throw notFound("Post");
    // Positions are unique per project, so park one square outside the grid for a moment.
    await tx.socialPost.update({ where: { id: a.id }, data: { position: MAX_POSTS + 1000 } });
    await tx.socialPost.update({ where: { id: b.id }, data: { position: a.position } });
    await tx.socialPost.update({ where: { id: a.id }, data: { position: b.position } });
    await activity(tx, actor.id, "feed.posts_swapped", { projectId }, { from: a.position, to: b.position });
    return { ok: true };
  });
}

export async function addPostImage(actor: SessionUser, projectId: string, postId: string, file: File) {
  const { post } = await postFor(actor, projectId, postId);
  if (!file || typeof file.arrayBuffer !== "function") throw invalid("No image received.");
  const ext = IMAGE_TYPES[file.type];
  if (!ext) throw invalid("Upload an image (PNG, JPG, WEBP or GIF). For a video, add its link instead.");
  if (file.size > MAX_UPLOAD_BYTES) throw invalid(`Images must be ${Math.round(MAX_UPLOAD_BYTES / 1048576)} MB or smaller.`);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!sniffOk(file.type, bytes)) throw invalid("The file content does not match its type.");
  const single = post.kind !== "CAROUSEL";
  if (!single && post.media.length >= MAX_CAROUSEL) throw invalid(`A carousel holds up to ${MAX_CAROUSEL} images.`);

  const key = `feed/${projectId}/${randomBytes(16).toString("hex")}${ext}`;
  await putObject(key, bytes, file.type);
  const created = await db.$transaction(async (tx) => {
    if (single && post.media.length) await tx.socialMedia.deleteMany({ where: { postId: post.id } });
    return tx.socialMedia.create({ data: { postId: post.id, position: single ? 0 : post.media.length, storageKey: key, mimeType: file.type, size: file.size } });
  });
  if (single) for (const m of post.media) await deleteObject(m.storageKey);
  await db.socialPost.update({ where: { id: post.id }, data: { updatedAt: new Date() } });
  return created;
}

export async function removePostImage(actor: SessionUser, mediaId: string) {
  const m = await db.socialMedia.findUnique({ where: { id: mediaId }, include: { post: true } });
  if (!m) throw notFound("Image");
  await postFor(actor, m.post.projectId, m.postId);
  await db.socialMedia.delete({ where: { id: m.id } });
  await deleteObject(m.storageKey);
  const rest = await db.socialMedia.findMany({ where: { postId: m.postId }, orderBy: { position: "asc" } });
  for (const [i, r] of rest.entries()) if (r.position !== i) await db.socialMedia.update({ where: { id: r.id }, data: { position: i } });
}

/** Images are private: a staff member who can see the project, or that client's own dashboard login. */
export async function readPostImage(who: { staff: SessionUser } | { clientId: string }, mediaId: string) {
  const m = await db.socialMedia.findUnique({ where: { id: mediaId }, include: { post: { select: { project: { select: { id: true, clientId: true } } } } } });
  if (!m) throw notFound("Image");
  if ("clientId" in who) {
    if (m.post.project.clientId !== who.clientId) throw notFound("Image");
  } else {
    const visible = await db.project.count({ where: { AND: [{ id: m.post.project.id }, projectScope(who.staff)] } });
    if (!visible && !(await workingOn(who.staff, m.post.project.id))) throw notFound("Image");
  }
  return { media: m, bytes: await getObject(m.storageKey) };
}

export function imageResponse(media: { mimeType: string }, bytes: Buffer) {
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": media.mimeType, "Content-Length": String(bytes.length), "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox", "Cache-Control": "private, max-age=3600",
    },
  });
}
