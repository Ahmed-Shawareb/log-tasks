import { route, searchParams } from "@/server/api";
import { workloadBoard } from "@/server/services/planning";

export const GET = route(async ({ req, user }) => {
  const sp = searchParams(req);
  return workloadBoard(user, { start: sp.start, days: sp.days ? Number(sp.days) : undefined, department: sp.department, teamId: sp.teamId, projectId: sp.projectId });
});
