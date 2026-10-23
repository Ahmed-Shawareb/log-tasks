import { z } from "zod";
import { db } from "@/lib/db";
import { body, publicRoute } from "@/server/api";
import { createResetToken } from "@/server/auth";
import { notify } from "@/server/audit";

/**
 * No email service is configured, so a reset request:
 *  - always returns the same response (no account enumeration),
 *  - notifies administrators in-app so they can issue a reset link from the Users screen,
 *  - in local development only, prints the link to the server console (never to the browser).
 */
export const POST = publicRoute(async ({ req }) => {
  const { email } = await body(req, z.object({ email: z.string().trim().toLowerCase().max(254) }));
  const user = await db.user.findUnique({ where: { email } });
  if (user?.isActive) {
    const admins = await db.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } });
    await notify(db, admins.map((a) => a.id), {
      type: "auth.reset_requested", title: "Password reset requested", body: `${user.name} (${user.email}) asked to reset their password.`,
      link: "/admin/users", dedupeKey: `reset:${user.id}:${new Date().toISOString().slice(0, 13)}`,
    });
    if (process.env.APP_ENV === "development" && process.env.NODE_ENV !== "production") {
      const token = await createResetToken(user.id, null);
      console.info(`[dev] password reset link for ${user.email}: ${process.env.APP_URL ?? "http://localhost:3000"}/reset-password?token=${token}`);
    }
  }
  return { ok: true, message: "If that account exists, an administrator has been notified and can send you a reset link." };
});
