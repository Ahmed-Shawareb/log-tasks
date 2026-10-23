import { z } from "zod";
import { body, publicRoute } from "@/server/api";
import { resetPasswordWithToken } from "@/server/auth";

export const POST = publicRoute(async ({ req }) => {
  const { token, password } = await body(req, z.object({ token: z.string().min(10).max(200), password: z.string().max(256) }));
  await resetPasswordWithToken(token, password);
  return { ok: true };
});
