import { z } from "zod";
import { route } from "@/server/api";
import { deleteChecklistItem, updateChecklistItem } from "@/server/services/tasks";

type P = { itemId: string };
export const PATCH = route<P>(async ({ req, user, params }) =>
  updateChecklistItem(user, params.itemId, z.object({ done: z.boolean().optional(), text: z.string().optional() }).parse(await req.json())));
export const DELETE = route<P>(async ({ user, params }) => {
  await deleteChecklistItem(user, params.itemId);
  return { ok: true };
});
