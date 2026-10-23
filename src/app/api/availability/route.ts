import { z } from "zod";
import { db } from "@/lib/db";
import { body, route } from "@/server/api";
import { notFound } from "@/server/errors";
import { peopleScope } from "@/server/permissions";
import { checkAvailability } from "@/server/services/availability";

/** Read-only pre-check so the UI can warn before a drop; the write endpoints re-check on the server. */
export const POST = route(async ({ req, user }) => {
  const input = await body(req, z.object({
    userId: z.string(), start: z.string().datetime({ offset: true }), end: z.string().datetime({ offset: true }), taskId: z.string().optional(),
  }));
  const visible = await db.user.count({ where: { AND: [{ id: input.userId }, peopleScope(user)] } });
  if (!visible) throw notFound("Person");
  return checkAvailability(db, input.userId, new Date(input.start), new Date(input.end), { excludeTaskId: input.taskId, taskId: input.taskId });
});
