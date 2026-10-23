import { route, searchParams } from "@/server/api";
import { createProject, listProjects } from "@/server/services/clients";

export const GET = route(async ({ req, user }) => listProjects(user, searchParams(req)));
export const POST = route(async ({ req, user }) => createProject(user, await req.json()));
