import { route } from "@/server/api";
import { deleteLeave } from "@/server/services/org";

export const DELETE = route<{ id: string }>(async ({ user, params }) => {
  await deleteLeave(user, params.id);
  return { ok: true };
});
