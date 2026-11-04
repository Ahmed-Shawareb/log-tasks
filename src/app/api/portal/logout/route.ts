import { NextResponse } from "next/server";
import { publicRoute } from "@/server/api";
import { PORTAL_COOKIE, portalLogout } from "@/server/portal";

export const POST = publicRoute(async ({ req }) => {
  await portalLogout(req.cookies.get(PORTAL_COOKIE)?.value);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(PORTAL_COOKIE);
  return res;
});
