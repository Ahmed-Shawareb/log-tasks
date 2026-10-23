import { route, searchParams } from "@/server/api";
import { createLeave, listLeaves } from "@/server/services/org";

export const GET = route(async ({ req, user }) => {
  const sp = searchParams(req);
  return listLeaves(user, sp.from ? new Date(sp.from) : undefined, sp.to ? new Date(sp.to) : undefined);
});
export const POST = route(async ({ req, user }) => createLeave(user, await req.json()));
