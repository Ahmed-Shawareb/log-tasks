import { route, searchParams } from "@/server/api";
import { createClient, listClients } from "@/server/services/clients";

export const GET = route(async ({ req, user }) => listClients(user, searchParams(req)));
export const POST = route(async ({ req, user }) => createClient(user, await req.json()));
