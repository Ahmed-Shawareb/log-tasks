import { route } from "@/server/api";
import { deleteTeam, updateTeam } from "@/server/services/org";

type P = { id: string };
export const PATCH = route<P>(async ({ req, user, params }) => updateTeam(user, params.id, await req.json()));
export const DELETE = route<P>(async ({ user, params }) => {
  await deleteTeam(user, params.id);
  return { ok: true };
});
