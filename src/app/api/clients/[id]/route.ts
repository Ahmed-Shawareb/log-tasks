import { route } from "@/server/api";
import { getClient, updateClient } from "@/server/services/clients";

type P = { id: string };
export const GET = route<P>(async ({ user, params }) => getClient(user, params.id));
export const PATCH = route<P>(async ({ req, user, params }) => updateClient(user, params.id, await req.json()));
