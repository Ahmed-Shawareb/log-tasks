import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { AppError } from "./errors";
import { audit } from "./audit";
import type { SessionUser } from "./permissions";

const BCRYPT_ROUNDS = 12;
export const SESSION_COOKIE = "log_session";
export const SESSION_TTL_HOURS = 12;
const LOGIN_WINDOW_MIN = 15;
const LOGIN_MAX_FAILURES = 5;

export const hashPassword = (plain: string) => bcrypt.hash(plain, BCRYPT_ROUNDS);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

export function validatePasswordStrength(pw: string): string | null {
  if (pw.length < 10) return "Password must be at least 10 characters.";
  if (pw.length > 128) return "Password is too long.";
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw)) return "Use upper- and lower-case letters and at least one number.";
  return null;
}

export function generatePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(20);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `Lg${out}9!`;
}

/** A hash nobody knows the password for — invited users set their own through a reset link. */
export const unusablePasswordHash = () => hashPassword(randomBytes(32).toString("hex"));

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s === "change-me" || s.length < 16) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set (32+ random bytes) in production");
    return "dev-only-insecure-session-secret";
  }
  return s;
}

export const hashToken = (token: string) => createHmac("sha256", secret()).update(token).digest("hex");

export async function createSession(userId: string, meta: { ip?: string | null; userAgent?: string | null }) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600_000);
  await db.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt, ipAddress: meta.ip ?? null, userAgent: meta.userAgent?.slice(0, 200) ?? null },
  });
  return { token, expiresAt };
}

export async function destroySession(token: string) {
  await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export function toSessionUser(u: {
  id: string; name: string; email: string; role: SessionUser["role"]; departmentId: string | null;
  department?: { key: string } | null; isTestAccount: boolean; mustChangePassword: boolean; avatarColor: string;
}): SessionUser {
  return {
    id: u.id, name: u.name, email: u.email, role: u.role, departmentId: u.departmentId,
    departmentKey: u.department?.key ?? null, isTestAccount: u.isTestAccount, mustChangePassword: u.mustChangePassword,
    avatarColor: u.avatarColor,
  };
}

export async function getUserFromToken(token: string | null | undefined): Promise<SessionUser | null> {
  if (!token || token.length > 200) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { department: true } } },
  });
  if (!session) return null;
  if (session.expiresAt < new Date() || !session.user.isActive) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  return toSessionUser(session.user);
}

let dummyHash: string | null = null;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync(randomBytes(16).toString("hex"), BCRYPT_ROUNDS));

const INVALID_LOGIN = "Incorrect email or password.";

export async function login(emailRaw: string, password: string, meta: { ip: string; userAgent?: string | null }) {
  const email = String(emailRaw ?? "").trim().toLowerCase();
  if (!email || !password || email.length > 254 || password.length > 256) throw new AppError("INVALID", INVALID_LOGIN);

  const since = new Date(Date.now() - LOGIN_WINDOW_MIN * 60_000);
  const [userFailures, ipFailures] = await Promise.all([
    db.loginAttempt.count({ where: { email, success: false, createdAt: { gte: since } } }),
    db.loginAttempt.count({ where: { ipAddress: meta.ip, success: false, createdAt: { gte: since } } }),
  ]);
  if (userFailures >= LOGIN_MAX_FAILURES || ipFailures >= LOGIN_MAX_FAILURES * 4) {
    throw new AppError("RATE_LIMITED", `Too many failed attempts. Try again in ${LOGIN_WINDOW_MIN} minutes.`);
  }

  const user = await db.user.findUnique({ where: { email }, include: { department: true } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? getDummyHash());
  const success = Boolean(user && ok && user.isActive);
  await db.loginAttempt.create({ data: { email, ipAddress: meta.ip, success } });
  if (!success || !user) {
    await audit(null, "auth.login_failed", "User", user?.id, { ip: meta.ip, actorEmail: email });
    throw new AppError("INVALID", INVALID_LOGIN);
  }
  const session = await createSession(user.id, meta);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit(toSessionUser(user), "auth.login", "User", user.id, { ip: meta.ip });
  return { ...session, user };
}

export async function changePassword(actor: SessionUser, current: string, next: string, keepToken?: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (!(await verifyPassword(current ?? "", user.passwordHash))) throw new AppError("INVALID", "Current password is incorrect.");
  const weak = validatePasswordStrength(next ?? "");
  if (weak) throw new AppError("INVALID", weak);
  if (current === next) throw new AppError("INVALID", "New password must differ from the current one.");
  await db.user.update({ where: { id: actor.id }, data: { passwordHash: await hashPassword(next), mustChangePassword: false } });
  // Sign out every other device.
  await db.session.deleteMany({ where: { userId: actor.id, ...(keepToken ? { NOT: { tokenHash: hashToken(keepToken) } } : {}) } });
  await audit(actor, "auth.password_changed", "User", actor.id);
}

const RESET_TTL_MIN = 60;

/** Creates a single-use reset token. Returns the raw token (shown once, only its HMAC is stored). */
export async function createResetToken(userId: string, createdById: string | null) {
  const token = randomBytes(32).toString("base64url");
  await db.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
  await db.passwordResetToken.create({
    data: { tokenHash: hashToken(token), userId, createdById, expiresAt: new Date(Date.now() + RESET_TTL_MIN * 60_000) },
  });
  return token;
}

export async function resetPasswordWithToken(token: string, next: string) {
  const weak = validatePasswordStrength(next ?? "");
  if (weak) throw new AppError("INVALID", weak);
  const rec = token
    ? await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } })
    : null;
  if (!rec || rec.usedAt || rec.expiresAt < new Date() || !rec.user.isActive) {
    throw new AppError("INVALID", "This reset link is invalid or has expired. Ask an administrator for a new one.");
  }
  const passwordHash = await hashPassword(next);
  await db.$transaction([
    db.user.update({ where: { id: rec.userId }, data: { passwordHash, mustChangePassword: false } }),
    db.passwordResetToken.update({ where: { id: rec.id }, data: { usedAt: new Date() } }),
    db.session.deleteMany({ where: { userId: rec.userId } }),
  ]);
  await audit(null, "auth.password_reset", "User", rec.userId, { actorEmail: rec.user.email });
}
