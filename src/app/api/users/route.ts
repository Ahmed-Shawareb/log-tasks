import { route, searchParams } from "@/server/api";
import { createUser, eligibleAssignees, listPeople } from "@/server/services/org";

export const GET = route(async ({ req, user }) => {
  const sp = searchParams(req);
  if (sp.eligible === "1") return eligibleAssignees(user, sp.department || null);
  return listPeople(user, { includeInactive: sp.inactive === "1", department: sp.department, q: sp.q });
});
export const POST = route(async ({ req, user }) => createUser(user, await req.json()));
