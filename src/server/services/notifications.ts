import "server-only";
import { db } from "@/lib/db";
import { taskRef } from "@/lib/utils";
import { notify } from "../audit";
import type { SessionUser } from "../permissions";

export async function listNotifications(actor: SessionUser, opts: { unreadOnly?: boolean; take?: number } = {}) {
  await sweepDeadlines().catch((e) => console.error("[sweep]", e));
  const [items, unread] = await Promise.all([
    db.notification.findMany({
      where: { userId: actor.id, ...(opts.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take: opts.take ?? 30,
    }),
    db.notification.count({ where: { userId: actor.id, readAt: null } }),
  ]);
  return { items, unread };
}

export async function markRead(actor: SessionUser, ids: string[] | "all") {
  await db.notification.updateMany({
    where: { userId: actor.id, readAt: null, ...(ids === "all" ? {} : { id: { in: ids } }) },
    data: { readAt: new Date() },
  });
}

const SWEEP_KEY = "deadlineSweepAt";
const SWEEP_EVERY_MS = 10 * 60_000;

/**
 * Generates "due soon" and "overdue" notifications. Idempotent (dedupe keys), throttled to once per 10 min,
 * triggered lazily by notification polling and by the Vercel cron at /api/cron/deadlines.
 */
export async function sweepDeadlines(force = false) {
  const last = await db.setting.findUnique({ where: { key: SWEEP_KEY } });
  const lastAt = last ? new Date(String(last.value)).getTime() : 0;
  if (!force && Date.now() - lastAt < SWEEP_EVERY_MS) return { skipped: true };
  await db.setting.upsert({ where: { key: SWEEP_KEY }, create: { key: SWEEP_KEY, value: new Date().toISOString() }, update: { value: new Date().toISOString() } });

  const now = new Date();
  const soon = new Date(now.getTime() + 24 * 3600_000);
  const open = { archivedAt: null, status: { notIn: ["APPROVED", "CANCELLED", "SUBMITTED"] as ("APPROVED" | "CANCELLED" | "SUBMITTED")[] } };
  const [dueSoon, overdue] = await Promise.all([
    db.task.findMany({ where: { ...open, dueAt: { gte: now, lte: soon }, assigneeId: { not: null } }, select: { id: true, number: true, title: true, assigneeId: true, dueAt: true } }),
    db.task.findMany({ where: { ...open, dueAt: { lt: now }, assigneeId: { not: null } }, select: { id: true, number: true, title: true, assigneeId: true, reviewerId: true, dueAt: true } }),
  ]);
  for (const t of dueSoon) {
    await notify(db, [t.assigneeId], {
      type: "task.due_soon", title: `Due within 24h: ${t.title}`, body: `${taskRef(t.number)} is due soon.`,
      taskId: t.id, link: `/tasks/${t.number}`, dedupeKey: `due:${t.id}:${t.dueAt!.toISOString()}`,
    });
  }
  for (const t of overdue) {
    await notify(db, [t.assigneeId, t.reviewerId], {
      type: "task.overdue", title: `Overdue: ${t.title}`, body: `${taskRef(t.number)} passed its deadline.`,
      taskId: t.id, link: `/tasks/${t.number}`, dedupeKey: `overdue:${t.id}:${t.dueAt!.toISOString()}`,
    });
  }
  return { dueSoon: dueSoon.length, overdue: overdue.length };
}
