import { NextResponse } from "next/server";
import { z } from "zod";
import { body, publicRoute } from "@/server/api";
import { login, SESSION_COOKIE } from "@/server/auth";
import { clientIp } from "@/server/session";

export const POST = publicRoute(async ({ req }) => {
  const { email, password } = await body(req, z.object({ email: z.string().max(254), password: z.string().max(256) }));
  const { token, expiresAt, user } = await login(email, password, { ip: await clientIp(), userAgent: req.headers.get("user-agent") });
  const res = NextResponse.json({ ok: true, mustChangePassword: user.mustChangePassword });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt,
  });
  return res;
});
