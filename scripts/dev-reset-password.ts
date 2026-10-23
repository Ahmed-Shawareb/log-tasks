/**
 * DEVELOPMENT ONLY — print a single-use password reset link for any local account.
 *
 *   npm run dev-reset-password -- rawan@lotsofgrowthgroup.com
 *
 * Refuses to run when APP_ENV/NODE_ENV is production. It needs direct database access, so it never exposes
 * accounts over the network. In production, administrators issue reset links from Admin → Users.
 */
import { PrismaClient } from "@prisma/client";
import { createHmac, randomBytes } from "node:crypto";

if (process.env.APP_ENV === "production" || process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
  console.error("Refusing to run in production. Use Admin → Users → Generate reset link.");
  process.exit(1);
}

const db = new PrismaClient();

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("Usage: npm run dev-reset-password -- user@example.com");
  const user = await db.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No user ${email}`);
  const secret = process.env.SESSION_SECRET && process.env.SESSION_SECRET !== "change-me" ? process.env.SESSION_SECRET : "dev-only-insecure-session-secret";
  const token = randomBytes(32).toString("base64url");
  await db.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
  await db.passwordResetToken.create({ data: { userId: user.id, tokenHash: createHmac("sha256", secret).update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  console.log(`\nReset link for ${email} (valid 60 minutes, single use):\n\n    ${process.env.APP_URL ?? "http://localhost:3100"}/reset-password?token=${token}\n`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); }).finally(() => db.$disconnect());
