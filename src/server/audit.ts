import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { SessionUser } from "./permissions";

type Tx = Prisma.TransactionClient | typeof db;

export async function audit(
  actor: SessionUser | null,
  action: string,
  entityType: string,
  entityId: string | null | undefined,
  opts: { before?: unknown; after?: unknown; ip?: string | null; tx?: Tx; actorEmail?: string } = {},
) {
  const client = opts.tx ?? db;
  await client.auditLog.create({
    data: {
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? opts.actorEmail ?? null,
      actorRole: actor?.role ?? null,
      action,
      entityType,
      entityId: entityId ?? null,
      before: (opts.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (opts.after ?? undefined) as Prisma.InputJsonValue | undefined,
      ipAddress: opts.ip ?? null,
    },
  });
}

export async function activity(
  tx: Tx,
  actorId: string | null,
  action: string,
  target: { taskId?: string; projectId?: string },
  data?: Record<string, unknown>,
) {
  await tx.activity.create({
    data: { actorId, action, taskId: target.taskId, projectId: target.projectId, data: data as Prisma.InputJsonValue },
  });
}

export async function notify(
  tx: Tx,
  userIds: (string | null | undefined)[],
  n: { type: string; title: string; body?: string; taskId?: string; link?: string; dedupeKey?: string },
  exceptUserId?: string,
) {
  const ids = [...new Set(userIds.filter((u): u is string => !!u && u !== exceptUserId))];
  for (const userId of ids) {
    const dedupeKey = n.dedupeKey ? `${n.dedupeKey}:${userId}` : undefined;
    if (dedupeKey) {
      await tx.notification.upsert({
        where: { dedupeKey },
        create: { userId, type: n.type, title: n.title, body: n.body, taskId: n.taskId, link: n.link, dedupeKey },
        update: {},
      });
    } else {
      await tx.notification.create({ data: { userId, type: n.type, title: n.title, body: n.body, taskId: n.taskId, link: n.link } });
    }
  }
}
