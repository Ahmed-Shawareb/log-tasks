import { route, searchParams } from "@/server/api";
import { forbidden } from "@/server/errors";
import { isManager } from "@/server/permissions";
import { dashboardData, peoplePerformance, resolveRange } from "@/server/services/analytics";

export const GET = route(async ({ req, user }) => {
  const sp = searchParams(req);
  const range = resolveRange(sp.range, sp.from, sp.to);
  if (sp.kind === "people") {
    if (!isManager(user)) throw forbidden();
    return peoplePerformance(user, range);
  }
  return dashboardData(user, range);
});
