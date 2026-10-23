import { route, searchParams } from "@/server/api";
import { createTask, listTasks, taskFilterSchema } from "@/server/services/tasks";

export const GET = route(async ({ req, user }) => listTasks(user, taskFilterSchema.parse(searchParams(req))));
export const POST = route(async ({ req, user }) => createTask(user, await req.json()));
