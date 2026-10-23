import { route } from "@/server/api";
import { bulkUpdate } from "@/server/services/tasks";

export const POST = route(async ({ req, user }) => bulkUpdate(user, await req.json()));
