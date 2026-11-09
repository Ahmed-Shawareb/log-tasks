import { route } from "@/server/api";
import { deleteProject, getProject, updateProject } from "@/server/services/clients";

type P = { id: string };
export const GET = route<P>(async ({ user, params }) => getProject(user, params.id));
export const PATCH = route<P>(async ({ req, user, params }) => updateProject(user, params.id, await req.json()));
// Permanent: the body must carry { confirm: "<exact name>" }.
export const DELETE = route<P>(async ({ req, user, params }) => deleteProject(user, params.id, await req.json().catch(() => ({}))));
