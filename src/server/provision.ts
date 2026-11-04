import "server-only";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { DEPARTMENTS } from "@/lib/constants";
import { hashPassword } from "./auth";
import { ROSTER, TEAMS } from "./roster";
import { TEMPLATES } from "./templates-data";
import { TASK_TYPES } from "./task-types-data";
import { wipeBusinessData } from "./wipe";

const PROVISIONED_KEY = "provisionedAt";

function oneTimePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return "Log-" + [...randomBytes(12)].map((b) => alphabet[b % alphabet.length]).join("") + "-26";
}

async function ensureBucket() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, ""), key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return "skipped (storage not configured)";
  const name = process.env.SUPABASE_STORAGE_BUCKET || "log-attachments";
  const res = await fetch(`${url}/storage/v1/bucket`, {
    method: "POST", headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ id: name, name, public: false, file_size_limit: 10 * 1024 * 1024 }),
  });
  if (res.ok) return `created private bucket ${name}`;
  const text = await res.text();
  return /already exists|Duplicate/i.test(text) ? `private bucket ${name} already exists` : `bucket error ${res.status}`;
}

/** Upserts the standard agency task types (keeps any admin edits to existing ones, unless `overwrite`). */
export async function ensureTaskTypes(overwrite = false) {
  for (const [i, t] of TASK_TYPES.entries()) {
    await db.taskType.upsert({ where: { name: t.name }, create: { ...t, sortOrder: i }, update: overwrite ? { ...t, sortOrder: i, isActive: true } : {} });
  }
}

/** Empties the private storage bucket (attachments and feed images of the data that was wiped). */
async function emptyBucket() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, ""), key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return "skipped (storage not configured)";
  const name = process.env.SUPABASE_STORAGE_BUCKET || "log-attachments";
  const res = await fetch(`${url}/storage/v1/bucket/${name}/empty`, { method: "POST", headers: { Authorization: `Bearer ${key}`, apikey: key } });
  return res.ok ? `emptied bucket ${name}` : `could not empty bucket (${res.status})`;
}

/**
 * Production setup: reference data, private storage bucket, the real team with one-time passwords.
 * Runs once (guarded by a setting) unless `force` is set. Never creates test accounts.
 */
export async function provisionProduction({ force = false, reset = false } = {}) {
  const done = await db.setting.findUnique({ where: { key: PROVISIONED_KEY } });
  if (done && !force && !reset) return { alreadyProvisioned: true, at: done.value } as const;

  // Reset: start completely empty — only the roster's accounts are kept (with new passwords).
  let removed: Record<string, number> | null = null, emptied: string | null = null;
  if (reset) {
    removed = await db.$transaction((tx) => wipeBusinessData(tx, ROSTER.map((r) => r.email), TASK_TYPES.map((t) => t.name)), { timeout: 120_000 });
    emptied = await emptyBucket();
  }

  const dept: Record<string, string> = {};
  for (const d of DEPARTMENTS) {
    dept[d.key] = (await db.department.upsert({ where: { key: d.key }, create: { key: d.key, name: d.name, color: d.color }, update: {} })).id;
  }
  await db.setting.upsert({ where: { key: "company" }, create: { key: "company", value: { name: "LOG — Lots of Growth", timezone: process.env.APP_TIMEZONE ?? "Africa/Cairo" } }, update: {} });
  for (const t of TEMPLATES) {
    const data = { description: t.description, priority: t.priority, departmentId: t.department ? dept[t.department] : null, blueprint: { checklist: t.checklist, subtasks: t.subtasks } as Prisma.InputJsonValue };
    await db.taskTemplate.upsert({ where: { name: t.name }, create: { name: t.name, ...data }, update: {} });
  }

  await ensureTaskTypes(reset);

  const credentials: { name: string; role: string; email: string; password: string }[] = [];
  const ids: Record<string, string> = {};
  for (const p of ROSTER) {
    const password = oneTimePassword();
    const data = { name: p.name, role: p.role, departmentId: dept[p.department], title: p.title, avatarColor: p.color, passwordHash: await hashPassword(password), mustChangePassword: true, isActive: true, isTestAccount: false };
    const u = await db.user.upsert({ where: { email: p.email }, create: { email: p.email, ...data }, update: data });
    await db.session.deleteMany({ where: { userId: u.id } });
    ids[p.email] = u.id;
    credentials.push({ name: p.name, role: p.role, email: p.email, password });
  }
  for (const t of TEAMS) {
    const team = await db.team.upsert({
      where: { name: t.name },
      create: { name: t.name, departmentId: dept[t.department]!, managerId: ids[t.managerEmail] },
      update: { managerId: ids[t.managerEmail] },
    });
    for (const p of ROSTER.filter((r) => t.members.includes(r.email))) {
      await db.teamMember.upsert({ where: { teamId_userId: { teamId: team.id, userId: ids[p.email]! } }, create: { teamId: team.id, userId: ids[p.email]! }, update: {} });
    }
  }
  const storage = await ensureBucket();
  await db.setting.upsert({ where: { key: PROVISIONED_KEY }, create: { key: PROVISIONED_KEY, value: new Date().toISOString() }, update: { value: new Date().toISOString() } });
  await db.auditLog.create({ data: { action: reset ? "system.reset_to_roster" : "system.provisioned", entityType: "System", actorEmail: "setup", after: { users: ROSTER.map((r) => r.email), storage, removed, emptied } } });
  return { alreadyProvisioned: false, storage, removed, emptied, credentials } as const;
}
