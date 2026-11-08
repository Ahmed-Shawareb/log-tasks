import "server-only";
import { randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { AppError } from "./errors";
import { audit } from "./audit";
import { hashPassword, hashToken, validatePasswordStrength } from "./auth";
import { isAdmin, type SessionUser } from "./permissions";

// Client dashboard sign-in. Clients have their own accounts, sessions and cookie — a client session can never
// reach a staff page or staff API (those only read the staff cookie), and it only ever sees its own client's data.

export const PORTAL_COOKIE = "log_client";
const TTL_HOURS = 24 * 7;
const WINDOW_MIN = 15;
const MAX_FAILURES = 5;

/** `personal`: a personal client of the founder — their dashboard (/space) carries no LOG branding. */
export type PortalUser = { id: string; email: string; clientId: string; clientName: string; onboarded: boolean; personal: boolean };

export const getPortalUser = cache(async (): Promise<PortalUser | null> => {
  const token = (await cookies()).get(PORTAL_COOKIE)?.value;
  if (!token || token.length > 200) return null;
  const s = await db.clientSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: { include: { client: true } } } });
  if (!s) return null;
  if (s.expiresAt < new Date() || !s.user.isActive || s.user.client.status === "ARCHIVED") {
    await db.clientSession.delete({ where: { id: s.id } }).catch(() => {});
    return null;
  }
  return { id: s.user.id, email: s.user.email, clientId: s.user.clientId, clientName: s.user.client.name, onboarded: !!s.user.onboardedAt, personal: !!s.user.client.privateOwnerId };
});

export async function requirePortalPage(loginPath = "/portal/login") {
  const u = await getPortalUser();
  if (!u) redirect(loginPath);
  return u;
}

export async function requirePortalApi() {
  const u = await getPortalUser();
  if (!u) throw new AppError("UNAUTHENTICATED", "Please sign in.");
  return u;
}

let dummy: string | null = null;
const INVALID = "Incorrect email or password.";

export async function portalLogin(emailRaw: string, password: string, ip: string) {
  const email = String(emailRaw ?? "").trim().toLowerCase();
  if (!email || !password || email.length > 254 || password.length > 256) throw new AppError("INVALID", INVALID);
  const key = `portal:${email}`;
  const since = new Date(Date.now() - WINDOW_MIN * 60_000);
  const [mine, fromIp] = await Promise.all([
    db.loginAttempt.count({ where: { email: key, success: false, createdAt: { gte: since } } }),
    db.loginAttempt.count({ where: { ipAddress: ip, success: false, createdAt: { gte: since } } }),
  ]);
  if (mine >= MAX_FAILURES || fromIp >= MAX_FAILURES * 4) throw new AppError("RATE_LIMITED", `Too many failed attempts. Try again in ${WINDOW_MIN} minutes.`);
  const user = await db.clientUser.findUnique({ where: { email }, include: { client: true } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? (dummy ??= bcrypt.hashSync(randomBytes(16).toString("hex"), 12)));
  const success = Boolean(user && ok && user.isActive && user.client.status !== "ARCHIVED");
  await db.loginAttempt.create({ data: { email: key, ipAddress: ip, success } });
  if (!success || !user) throw new AppError("INVALID", INVALID);
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_HOURS * 3600_000);
  await db.clientSession.create({ data: { tokenHash: hashToken(token), clientUserId: user.id, expiresAt } });
  await db.clientUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit(null, "portal.login", "Client", user.clientId, { actorEmail: email, ip });
  return { token, expiresAt };
}

export async function portalLogout(token: string | undefined) {
  if (token) await db.clientSession.deleteMany({ where: { tokenHash: hashToken(token) } });
}

/** Admin sets (or changes) the client's dashboard login. A new password signs the client out everywhere. */
export async function setPortalLogin(actor: SessionUser, clientId: string, raw: { email?: string; password?: string | null; isActive?: boolean }) {
  if (!isAdmin(actor)) throw new AppError("FORBIDDEN", "Only administrators manage client logins.");
  const client = await db.client.findUnique({ where: { id: clientId }, include: { portalUsers: true } });
  if (!client) throw new AppError("NOT_FOUND", "Client not found.");
  const existing = client.portalUsers[0] ?? null;
  const email = raw.email?.trim().toLowerCase();
  if (email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError("INVALID", "Enter a valid email for the client's login.");
  if (email && (await db.user.count({ where: { email } }))) throw new AppError("INVALID", "That email belongs to a LOG staff account. Use the client's own email.");
  if (email && (await db.clientUser.count({ where: { email, NOT: existing ? { id: existing.id } : undefined } }))) throw new AppError("CONFLICT", "Another client already uses that email.");
  if (raw.password) {
    const weak = validatePasswordStrength(raw.password);
    if (weak) throw new AppError("INVALID", weak);
  }
  if (!existing) {
    if (!email || !raw.password) throw new AppError("INVALID", "Give the client an email and a password.");
    const u = await db.clientUser.create({ data: { clientId, email, passwordHash: await hashPassword(raw.password), isActive: raw.isActive ?? true } });
    await audit(actor, "portal.login_created", "Client", clientId, { after: { email } });
    return { email: u.email, isActive: u.isActive, lastLoginAt: u.lastLoginAt };
  }
  const u = await db.clientUser.update({
    where: { id: existing.id },
    data: { email, isActive: raw.isActive, ...(raw.password ? { passwordHash: await hashPassword(raw.password) } : {}) },
  });
  if (raw.password || raw.isActive === false) await db.clientSession.deleteMany({ where: { clientUserId: u.id } });
  await audit(actor, "portal.login_updated", "Client", clientId, { before: { email: existing.email, isActive: existing.isActive }, after: { email: u.email, isActive: u.isActive, passwordChanged: !!raw.password } });
  return { email: u.email, isActive: u.isActive, lastLoginAt: u.lastLoginAt };
}
