import { route } from "@/server/api";
import { stopTimer } from "@/server/services/tasks";

export const DELETE = route(async ({ user }) => {
  await stopTimer(user);
  return { ok: true };
});
