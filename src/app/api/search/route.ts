import { route } from "@/server/api";
import { globalSearch } from "@/server/services/planning";

export const GET = route(async ({ req, user }) => globalSearch(user, req.nextUrl.searchParams.get("q") ?? ""));
