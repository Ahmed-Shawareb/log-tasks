import { route } from "@/server/api";
import { createTeam, listTeams } from "@/server/services/org";

export const GET = route(async ({ user }) => listTeams(user));
export const POST = route(async ({ req, user }) => createTeam(user, await req.json()));
