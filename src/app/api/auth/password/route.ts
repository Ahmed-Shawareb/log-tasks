import { z } from "zod";
import { cookies } from "next/headers";
import { body, route } from "@/server/api";
import { changePassword, SESSION_COOKIE } from "@/server/auth";

export const POST = route(async ({ req, user }) => {
  const { current, next } = await body(req, z.object({ current: z.string().max(256), next: z.string().max(256) }));
  const jar = await cookies();
  await changePassword(user, current, next, jar.get(SESSION_COOKIE)?.value);
  return { ok: true };
});
