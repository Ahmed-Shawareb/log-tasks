import { route } from "@/server/api";
import { listTaskTypes, saveTaskType } from "@/server/services/task-types";

export const GET = route(async ({ req, user }) => listTaskTypes(user.role === "ADMIN" && req.nextUrl.searchParams.get("all") === "1"));
export const POST = route(async ({ req, user }) => saveTaskType(user, await req.json()));
