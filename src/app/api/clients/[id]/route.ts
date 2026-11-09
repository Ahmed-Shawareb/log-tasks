import { route } from "@/server/api";
import { deleteClient, getClient, updateClient } from "@/server/services/clients";

type P = { id: string };
export const GET = route<P>(async ({ user, params }) => getClient(user, params.id));
export const PATCH = route<P>(async ({ req, user, params }) => updateClient(user, params.id, await req.json()));
// Permanent: the body must carry { confirm: "<exact name>" }.
export const DELETE = route<P>(async ({ req, user, params }) => deleteClient(user, params.id, await req.json().catch(() => ({}))));
