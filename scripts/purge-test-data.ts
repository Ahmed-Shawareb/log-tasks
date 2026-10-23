/**
 * Remove ALL test & demo data so the system starts clean ("production phase").
 *
 *   npm run purge-test-data -- --yes
 *
 * Deletes: every task (and its comments, files, submissions, reviews, time, hand-offs), projects, clients,
 * notifications, activity, leave, teams, sessions, reset tokens, login attempts, the old audit trail,
 * and every account flagged as a test account (the *@log.local users). Keeps: departments, templates,
 * settings and real (non-test) users. Local uploaded files in ./storage are removed too.
 */
import { PrismaClient } from "@prisma/client";
import { rmSync } from "node:fs";
import path from "node:path";

if (!process.argv.includes("--yes")) {
  console.error("This permanently deletes all tasks, projects, clients and test accounts. Re-run with --yes to confirm.");
  process.exit(1);
}

const db = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING });

async function main() {
  const counts = await db.$transaction(async (tx) => {
    const c: Record<string, number> = {};
    c.dependencies = (await tx.taskDependency.deleteMany()).count;
    c.checklist = (await tx.checklistItem.deleteMany()).count;
    c.comments = (await tx.comment.deleteMany()).count;
    c.attachments = (await tx.attachment.deleteMany()).count;
    c.reviews = (await tx.review.deleteMany()).count;
    c.submissions = (await tx.submission.deleteMany()).count;
    c.timeEntries = (await tx.timeEntry.deleteMany()).count;
    c.handoffs = (await tx.handoff.deleteMany()).count;
    c.notifications = (await tx.notification.deleteMany()).count;
    c.activity = (await tx.activity.deleteMany()).count;
    await tx.task.updateMany({ data: { parentId: null } });
    c.tasks = (await tx.task.deleteMany()).count;
    c.projects = (await tx.project.deleteMany()).count;
    c.clients = (await tx.client.deleteMany()).count;
    c.leave = (await tx.leave.deleteMany()).count;
    c.teamMembers = (await tx.teamMember.deleteMany()).count;
    c.teams = (await tx.team.deleteMany()).count;
    c.sessions = (await tx.session.deleteMany()).count;
    c.resetTokens = (await tx.passwordResetToken.deleteMany()).count;
    c.loginAttempts = (await tx.loginAttempt.deleteMany()).count;
    c.auditLog = (await tx.auditLog.deleteMany()).count;
    c.testUsers = (await tx.user.deleteMany({ where: { OR: [{ isTestAccount: true }, { email: { endsWith: "@log.local" } }] } })).count;
    await tx.setting.deleteMany({ where: { key: "deadlineSweepAt" } });
    await tx.auditLog.create({ data: { action: "system.purge_test_data", entityType: "System", actorEmail: "cli", after: c } });
    return c;
  });
  rmSync(path.join(process.cwd(), "storage", "uploads"), { recursive: true, force: true });
  console.log("Removed:", counts);
  console.log("Remaining users:", (await db.user.findMany({ select: { email: true, role: true } })).map((u) => `${u.email} (${u.role})`).join(", ") || "none");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
