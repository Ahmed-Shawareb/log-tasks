import { route } from "@/server/api";
import { saveTaskType } from "@/server/services/task-types";

export const PATCH = route<{ id: string }>(async ({ req, user, params }) => saveTaskType(user, await req.json(), params.id));
