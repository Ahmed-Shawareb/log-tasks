import { route } from "@/server/api";
import { notFound } from "@/server/errors";
import { issueResetLink, setTemporaryPassword, updateUser } from "@/server/services/org";

type P = { id: string };
export const PATCH = route<P>(async ({ req, user, params }) => updateUser(user, params.id, await req.json()));

export const POST = route<P>(async ({ req, user, params }) => {
  const action = req.nextUrl.searchParams.get("action");
  if (action === "reset-link") return issueResetLink(user, params.id);
  if (action === "temp-password") return setTemporaryPassword(user, params.id);
  throw notFound("Action");
});
