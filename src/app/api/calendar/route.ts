import { route, searchParams } from "@/server/api";
import { invalid } from "@/server/errors";
import { calendarFeed } from "@/server/services/planning";
import { taskFilterSchema } from "@/server/services/tasks";

export const GET = route(async ({ req, user }) => {
  const sp = searchParams(req);
  const from = new Date(sp.from ?? ""), to = new Date(sp.to ?? "");
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || to <= from || to.getTime() - from.getTime() > 120 * 86_400_000) {
    throw invalid("Provide a valid from/to range (max 120 days).");
  }
  const { from: _f, to: _t, ...rest } = sp;
  return calendarFeed(user, from, to, taskFilterSchema.parse(rest));
});
