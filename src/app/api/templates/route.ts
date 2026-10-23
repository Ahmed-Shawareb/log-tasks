import { route } from "@/server/api";
import { listTemplates, saveTemplate } from "@/server/services/planning";

export const GET = route(async () => listTemplates());
export const POST = route(async ({ req, user }) => saveTemplate(user, await req.json()));
