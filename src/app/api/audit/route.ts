import { route, searchParams } from "@/server/api";
import { listAudit } from "@/server/services/planning";

export const GET = route(async ({ req, user }) => {
  const sp = searchParams(req);
  return listAudit(user, { q: sp.q, entityType: sp.entityType, page: sp.page ? Number(sp.page) : 1 });
});
