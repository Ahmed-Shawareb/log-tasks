import { route } from "@/server/api";
import { db } from "@/lib/db";

// The first-time welcome screens were seen (or skipped).
export const POST = route(async ({ user }) => {
  await db.user.update({ where: { id: user.id }, data: { onboardedAt: new Date() } });
  return { ok: true };
});
