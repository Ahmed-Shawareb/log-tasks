import { NextResponse } from "next/server";
import { z } from "zod";
import { body, publicRoute } from "@/server/api";
import { clientIp } from "@/server/session";
import { PORTAL_COOKIE, portalLogin } from "@/server/portal";

export const POST = publicRoute(async ({ req }) => {
  const { email, password } = await body(req, z.object({ email: z.string().max(254), password: z.string().max(256) }));
  const { token, expiresAt } = await portalLogin(email, password, await clientIp());
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PORTAL_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt });
  return res;
});
