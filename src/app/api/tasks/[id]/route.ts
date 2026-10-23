import { route } from "@/server/api";
import { getTaskDetail, updateTask } from "@/server/services/tasks";

type P = { id: string };
export const GET = route<P>(async ({ user, params }) => getTaskDetail(user, params.id));
export const PATCH = route<P>(async ({ req, user, params }) => updateTask(user, params.id, await req.json()));
