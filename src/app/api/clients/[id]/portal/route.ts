import { z } from "zod";
import { body, route } from "@/server/api";
import { setPortalLogin } from "@/server/portal";

type P = { id: string };
const schema = z.object({ email: z.string().max(254).optional(), password: z.string().max(128).nullable().optional(), isActive: z.boolean().optional() });
export const PUT = route<P>(async ({ req, user, params }) => setPortalLogin(user, params.id, await body(req, schema)));
