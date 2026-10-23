import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUserFromToken, SESSION_COOKIE } from "./auth";
import type { SessionUser } from "./permissions";
import { AppError } from "./errors";

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  return getUserFromToken(jar.get(SESSION_COOKIE)?.value);
});

/** For pages: redirect to login when signed out. */
export async function requirePageUser(): Promise<SessionUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requirePageRole(roles: SessionUser["role"][]): Promise<SessionUser> {
  const u = await requirePageUser();
  if (!roles.includes(u.role)) redirect("/dashboard?denied=1");
  return u;
}

export async function requireApiUser(): Promise<SessionUser> {
  const u = await getCurrentUser();
  if (!u) throw new AppError("UNAUTHENTICATED", "Please sign in.");
  return u;
}

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}
