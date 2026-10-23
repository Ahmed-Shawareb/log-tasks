import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { publicRoute } from "@/server/api";
import { destroySession, SESSION_COOKIE } from "@/server/auth";

export const POST = publicRoute(async () => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await destroySession(token);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
});
