import { z } from "zod";
import { body, route, searchParams } from "@/server/api";
import { listNotifications, markRead } from "@/server/services/notifications";

export const GET = route(async ({ req, user }) => listNotifications(user, { unreadOnly: searchParams(req).unread === "1" }));
export const POST = route(async ({ req, user }) => {
  const { ids } = await body(req, z.object({ ids: z.union([z.literal("all"), z.array(z.string()).max(200)]) }));
  await markRead(user, ids);
  return { ok: true };
});
