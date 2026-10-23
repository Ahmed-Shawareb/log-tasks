import { route } from "@/server/api";
import { deleteTemplate, saveTemplate } from "@/server/services/planning";

type P = { id: string };
export const PATCH = route<P>(async ({ req, user, params }) => saveTemplate(user, await req.json(), params.id));
export const DELETE = route<P>(async ({ user, params }) => {
  await deleteTemplate(user, params.id);
  return { ok: true };
});
