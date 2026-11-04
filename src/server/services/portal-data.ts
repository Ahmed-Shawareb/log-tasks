import "server-only";
import { db } from "@/lib/db";
import { feedInclude } from "./social";

// What a client sees on their dashboard. Built only from their own client id, and never includes internal details
// (who does the work, comments, notes, review feedback).

type Stage = "done" | "review" | "in_progress" | "upcoming";
const stageOf = (status: string): Stage =>
  status === "APPROVED" ? "done" : status === "SUBMITTED" ? "review" : ["IN_PROGRESS", "CHANGES_REQUESTED"].includes(status) ? "in_progress" : "upcoming";

export async function portalOverview(clientId: string) {
  const client = await db.client.findUniqueOrThrow({ where: { id: clientId }, select: { name: true } });
  const projects = await db.project.findMany({
    where: { clientId, status: { not: "ARCHIVED" } },
    select: {
      id: true, name: true, kind: true, color: true, status: true, startDate: true, targetDate: true, postCount: true,
      posts: { include: feedInclude, orderBy: { position: "asc" } },
    },
    orderBy: [{ kind: "desc" }, { createdAt: "asc" }],
  });
  const tasks = await db.task.findMany({
    where: { projectId: { in: projects.map((p) => p.id) }, archivedAt: null, status: { not: "CANCELLED" } },
    select: {
      id: true, title: true, projectId: true, parentId: true, stage: true, quantity: true, status: true, dueAt: true, completedAt: true,
      type: { select: { name: true, unit: true, unitPlural: true, color: true, stages: true } },
      _count: { select: { children: { where: { archivedAt: null, status: { not: "CANCELLED" } } } } },
    },
  });
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const isPlan = (t: (typeof tasks)[number]) => t.parentId === null && t.stage === null && t.quantity !== null && !!t.type?.stages.length;

  // Orders ("30 Videos Social Media") with how far each step has got.
  const orders = tasks.filter(isPlan).map((o) => {
    const parts = tasks.filter((t) => t.parentId === o.id && t.stage !== null);
    const steps = o.type!.stages.map((name, k) => {
      const mine = parts.filter((p) => p.stage === k);
      const done = mine.reduce((a, p) => a + (p.status === "APPROVED" ? p.quantity ?? 0
        : tasks.filter((c) => c.parentId === p.id && c.status === "APPROVED").reduce((s, c) => s + (c.quantity ?? 0), 0)), 0);
      return { name, done: Math.min(done, o.quantity!), planned: Math.min(mine.reduce((a, p) => a + (p.quantity ?? 0), 0), o.quantity!) };
    });
    const nextDue = parts.filter((p) => p.status !== "APPROVED" && p.dueAt).map((p) => p.dueAt!).sort((a, b) => +a - +b)[0] ?? null;
    return {
      id: o.id, projectId: o.projectId, name: o.type!.name, quantity: o.quantity!, unit: o.type!.unitPlural ?? o.type!.unit ?? "items",
      color: o.type!.color, dueAt: o.dueAt, nextDue, steps, done: steps.at(-1)?.done ?? 0,
    };
  });

  // Everything that gets delivered, one row per piece of work (a split piece replaces its parent).
  const items = tasks.filter((t) => !isPlan(t) && t._count.children === 0).map((t) => {
    let root = t;
    for (let i = 0; i < 6 && root.parentId && byId.get(root.parentId); i++) root = byId.get(root.parentId)!;
    const step = t.stage !== null ? t.type?.stages[t.stage] ?? null : null;
    return {
      id: t.id, projectId: t.projectId, title: t.title, step, type: t.type?.name ?? null, quantity: t.quantity,
      color: t.type?.color ?? "#8b5cf6", dueAt: t.dueAt, completedAt: t.completedAt, state: stageOf(t.status), orderId: isPlan(root) ? root.id : null,
    };
  }).sort((a, b) => +(a.dueAt ?? a.completedAt ?? 0) - +(b.dueAt ?? b.completedAt ?? 0));

  const live = items.length;
  const done = items.filter((i) => i.state === "done").length;
  return {
    client: client.name,
    updatedAt: new Date().toISOString(),
    summary: { total: live, done, review: items.filter((i) => i.state === "review").length, progress: live ? Math.round((done / live) * 100) : 0 },
    projects: projects.map((p) => {
      const mine = items.filter((i) => i.projectId === p.id);
      const d = mine.filter((i) => i.state === "done").length;
      return {
        id: p.id, name: p.name, kind: p.kind, color: p.color, status: p.status, startDate: p.startDate, targetDate: p.targetDate,
        progress: mine.length ? Math.round((d / mine.length) * 100) : 0,
        posts: p.kind === "SOCIAL_MEDIA" ? p.posts.map((x) => ({ id: x.id, position: x.position, kind: x.kind, link: x.link, driveLink: x.kind === "REEL" ? x.driveLink : null, caption: x.caption, publishAt: x.publishAt, media: x.media.map((m) => m.id) })) : [],
      };
    }),
    orders,
    items,
  };
}
