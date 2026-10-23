/**
 * Create / update the real team from scripts/roster.ts with a fresh one-time password each.
 *
 *   npm run provision-users            (uses DATABASE_URL — point it at the production database)
 *
 * - Every listed person gets a new strong random password and must change it at first sign-in.
 * - Passwords are written ONLY to CREDENTIALS.local.md (git-ignored) on this computer. Share each one privately.
 * - Teams are created and members attached. Also creates the private Supabase Storage bucket if configured.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { DEPARTMENTS } from "../src/lib/constants";
import { ROSTER, TEAMS } from "./roster";

const db = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING });

function password() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return "Log-" + [...randomBytes(12)].map((b) => alphabet[b % alphabet.length]).join("") + "-26";
}

async function ensureBucket() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, ""), key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return "skipped (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set)";
  const name = process.env.SUPABASE_STORAGE_BUCKET || "log-attachments";
  const res = await fetch(`${url}/storage/v1/bucket`, {
    method: "POST", headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ id: name, name, public: false, file_size_limit: 10 * 1024 * 1024 }),
  });
  if (res.ok) return `created private bucket "${name}"`;
  const text = await res.text();
  return /already exists|Duplicate/i.test(text) ? `private bucket "${name}" already exists` : `bucket error ${res.status}: ${text.slice(0, 200)}`;
}

async function main() {
  const dept: Record<string, string> = {};
  for (const d of DEPARTMENTS) dept[d.key] = (await db.department.upsert({ where: { key: d.key }, create: { key: d.key, name: d.name, color: d.color }, update: {} })).id;

  const rows: { name: string; email: string; role: string; password: string }[] = [];
  const ids: Record<string, string> = {};
  for (const p of ROSTER) {
    const pw = password();
    const passwordHash = await bcrypt.hash(pw, 12);
    const data = { name: p.name, role: p.role, departmentId: dept[p.department], title: p.title, avatarColor: p.color, passwordHash, mustChangePassword: true, isActive: true, isTestAccount: false };
    const u = await db.user.upsert({ where: { email: p.email }, create: { email: p.email, ...data }, update: data });
    await db.session.deleteMany({ where: { userId: u.id } });
    ids[p.email] = u.id;
    rows.push({ name: p.name, email: p.email, role: p.role, password: pw });
  }

  for (const t of TEAMS) {
    const team = await db.team.upsert({
      where: { name: t.name },
      create: { name: t.name, departmentId: dept[t.department]!, managerId: ids[t.managerEmail] },
      update: { managerId: ids[t.managerEmail], departmentId: dept[t.department]! },
    });
    for (const p of ROSTER.filter((r) => r.department === t.department)) {
      await db.teamMember.upsert({ where: { teamId_userId: { teamId: team.id, userId: ids[p.email]! } }, create: { teamId: team.id, userId: ids[p.email]! }, update: {} });
    }
  }
  await db.auditLog.create({ data: { action: "users.provisioned", entityType: "User", actorEmail: "cli", after: { emails: ROSTER.map((r) => r.email) } } });

  const bucket = await ensureBucket();
  const md = [
    "# LOG — initial sign-in credentials (PRIVATE — do not commit or share in group chats)",
    "",
    `Generated ${new Date().toISOString()}. Each person must change their password at first sign-in.`,
    "",
    "| Name | Role | Email | One-time password |",
    "|---|---|---|---|",
    ...rows.map((r) => `| ${r.name} | ${r.role} | ${r.email} | \`${r.password}\` |`),
    "",
  ].join("\n");
  writeFileSync("CREDENTIALS.local.md", md);
  console.log(`Provisioned ${rows.length} users and ${TEAMS.length} teams. Storage: ${bucket}`);
  console.log("Passwords written to CREDENTIALS.local.md (git-ignored).");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
