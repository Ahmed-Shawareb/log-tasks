import type { Prisma } from "@prisma/client";

/**
 * Deletes every piece of business data — tasks, clients, projects, feeds, client logins, notifications, teams,
 * templates, sessions, audit log — and every account whose email is not in `keepEmails`.
 * Used by `npm run reset-to-roster` (local) and by the one-time production reset. Run it inside a transaction.
 */
export async function wipeBusinessData(tx: Prisma.TransactionClient, keepEmails: string[], keepTaskTypes: string[]) {
  const c: Record<string, number> = {};
  for (const [name, del] of [
    ["dependencies", () => tx.taskDependency.deleteMany()], ["checklist", () => tx.checklistItem.deleteMany()],
    ["comments", () => tx.comment.deleteMany()], ["attachments", () => tx.attachment.deleteMany()],
    ["reviews", () => tx.review.deleteMany()], ["submissions", () => tx.submission.deleteMany()],
    ["timeEntries", () => tx.timeEntry.deleteMany()], ["handoffs", () => tx.handoff.deleteMany()],
    ["notifications", () => tx.notification.deleteMany()], ["activity", () => tx.activity.deleteMany()],
  ] as const) c[name] = (await del()).count;
  await tx.task.updateMany({ data: { parentId: null } });
  c.tasks = (await tx.task.deleteMany()).count;
  c.feedImages = (await tx.socialMedia.deleteMany()).count;
  c.posts = (await tx.socialPost.deleteMany()).count;
  c.projects = (await tx.project.deleteMany()).count;
  c.clientSessions = (await tx.clientSession.deleteMany()).count;
  c.clientLogins = (await tx.clientUser.deleteMany()).count;
  c.clients = (await tx.client.deleteMany()).count;
  c.leave = (await tx.leave.deleteMany()).count;
  c.teamMembers = (await tx.teamMember.deleteMany()).count;
  c.teams = (await tx.team.deleteMany()).count;
  c.templates = (await tx.taskTemplate.deleteMany()).count;
  c.taskTypes = (await tx.taskType.deleteMany({ where: { name: { notIn: keepTaskTypes } } })).count;
  c.sessions = (await tx.session.deleteMany()).count;
  c.resetTokens = (await tx.passwordResetToken.deleteMany()).count;
  c.loginAttempts = (await tx.loginAttempt.deleteMany()).count;
  c.auditLog = (await tx.auditLog.deleteMany()).count;
  c.users = (await tx.user.deleteMany({ where: { email: { notIn: keepEmails } } })).count;
  await tx.setting.deleteMany({ where: { key: "deadlineSweepAt" } });
  return c;
}
