import { z } from "zod";
import { body, route } from "@/server/api";
import { setLeadHandled } from "@/server/services/leads";

type P = { id: string };
export const PATCH = route<P>(async ({ req, user, params }) => setLeadHandled(user, params.id, (await body(req, z.object({ handled: z.boolean() }))).handled));
