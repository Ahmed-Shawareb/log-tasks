/**
 * Secure first-administrator setup (works for local and production databases).
 *
 *   npm run create-admin -- --email m.makady@lotsofgrowthgroup.com --name "Mostafa Makady"
 *
 * Run it by an operator with database access (DATABASE_URL). It never derives privileges from the email:
 * the person running this command is the authority. A strong random password is printed ONCE;
 * the account must change it at first sign-in. Use --promote to make an existing user an administrator.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const db = new PrismaClient();
const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : undefined; };

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  const name = arg("name")?.trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Usage: npm run create-admin -- --email you@company.com --name \"Full Name\" [--promote]");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const password = "Lg" + [...randomBytes(20)].map((b) => alphabet[b % alphabet.length]).join("") + "9!";
  const passwordHash = await bcrypt.hash(password, 12);
  const dept = await db.department.upsert({ where: { key: "MANAGEMENT" }, create: { key: "MANAGEMENT", name: "Management", color: "#e11d48" }, update: {} });

  const existing = await db.user.findUnique({ where: { email } });
  if (existing && existing.role !== "ADMIN" && !process.argv.includes("--promote")) {
    throw new Error(`${email} exists with role ${existing.role}. Re-run with --promote to make them an administrator.`);
  }
  const user = existing
    ? await db.user.update({ where: { id: existing.id }, data: { role: "ADMIN", departmentId: dept.id, passwordHash, mustChangePassword: true, isActive: true } })
    : await db.user.create({ data: { email, name: name || email, role: "ADMIN", departmentId: dept.id, passwordHash, mustChangePassword: true } });
  await db.session.deleteMany({ where: { userId: user.id } });
  await db.auditLog.create({ data: { action: existing ? "admin.cli_promote_or_reset" : "admin.cli_create", entityType: "User", entityId: user.id, actorEmail: "cli", after: { email } } });

  console.log(`\nAdministrator ready: ${email}`);
  console.log(`One-time password (shown once, change it at first sign-in):\n\n    ${password}\n`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); }).finally(() => db.$disconnect());
