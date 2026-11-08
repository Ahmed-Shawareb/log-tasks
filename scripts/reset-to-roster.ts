/**
 * Start the LOCAL database over with only the people in src/server/roster.ts.
 *
 *   npm run reset-to-roster -- --yes
 *
 * Deletes every task, client, project, notification, team, template, old task type and every account that is not
 * in the roster. Then creates the roster with fresh passwords, the teams, and the task types with their steps.
 * Passwords are written ONLY to LOCALHOST-CREDENTIALS.local.md (git-ignored).
 * Refuses to run against anything but a database on this computer.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEPARTMENTS } from "../src/lib/constants";
import { ROSTER, TEAMS } from "../src/server/roster";
import { TASK_TYPES } from "../src/server/task-types-data";
import { wipeBusinessData } from "../src/server/wipe";

const url = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
const host = (() => { try { return new URL(url).hostname; } catch { return ""; } })();
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  console.error(`Refusing: this resets a database on "${host || "unknown host"}". It only runs against a local database.`);
  process.exit(1);
}
if (!process.argv.includes("--yes")) {
  console.error("This permanently deletes all data except the roster accounts. Re-run with --yes to confirm.");
  process.exit(1);
}

const db = new PrismaClient({ datasourceUrl: url });

function password() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return "Log-" + [...randomBytes(10)].map((b) => alphabet[b % alphabet.length]).join("") + "-26";
}

async function main() {
  const keep = ROSTER.map((r) => r.email);
  const removed = await db.$transaction((tx) => wipeBusinessData(tx, keep, TASK_TYPES.map((t) => t.name)), { timeout: 120_000 });
  rmSync(path.join(process.cwd(), "storage", "uploads"), { recursive: true, force: true });

  const dept: Record<string, string> = {};
  for (const d of DEPARTMENTS) dept[d.key] = (await db.department.upsert({ where: { key: d.key }, create: { key: d.key, name: d.name, color: d.color }, update: {} })).id;
  for (const [i, t] of TASK_TYPES.entries()) {
    await db.taskType.upsert({ where: { name: t.name }, create: { ...t, sortOrder: i }, update: { ...t, sortOrder: i, isActive: true } });
  }

  const rows: { name: string; role: string; title: string; email: string; password: string }[] = [];
  const ids: Record<string, string> = {};
  for (const p of ROSTER) {
    const pw = password();
    const data = { name: p.name, role: p.role, departmentId: dept[p.department], title: p.title, avatarColor: p.color, passwordHash: await bcrypt.hash(pw, 12), mustChangePassword: false, isActive: true, isTestAccount: false, canOwnPrivateClients: p.role === "ADMIN" && !!p.privateClients };
    const u = await db.user.upsert({ where: { email: p.email }, create: { email: p.email, ...data }, update: data });
    ids[p.email] = u.id;
    rows.push({ name: p.name, role: p.role, title: p.title, email: p.email, password: pw });
  }
  for (const t of TEAMS) {
    const team = await db.team.create({ data: { name: t.name, departmentId: dept[t.department]!, managerId: ids[t.managerEmail] } });
    for (const email of t.members) await db.teamMember.create({ data: { teamId: team.id, userId: ids[email]! } });
  }
  await db.auditLog.create({ data: { action: "system.reset_to_roster", entityType: "System", actorEmail: "cli", after: { removed, users: keep } } });

  const md = [
    "# LOG — localhost accounts (PRIVATE — this computer only, do not share in group chats)",
    "",
    `Generated ${new Date().toISOString()} for http://localhost:3100. These passwords only work on this computer's database.`,
    "",
    "| Name | Role | Job | Email | Password |",
    "|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.name} | ${r.role} | ${r.title} | ${r.email} | \`${r.password}\` |`),
    "",
    "Teams: " + TEAMS.map((t) => `${t.name} (${t.members.map((e) => ROSTER.find((r) => r.email === e)?.name).join(", ")})`).join(" · "),
    "",
  ].join("\n");
  writeFileSync("LOCALHOST-CREDENTIALS.local.md", md);
  console.log("Removed:", removed);
  console.log(`Kept ${rows.length} accounts, ${TEAMS.length} teams, ${TASK_TYPES.length} task types. Passwords in LOCALHOST-CREDENTIALS.local.md`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
