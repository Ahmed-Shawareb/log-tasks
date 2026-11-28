import { publicRoute, route } from "@/server/api";
import { clientIp } from "@/server/session";
import { createLead, listLeads } from "@/server/services/leads";

// POST: the public website's contact form (no sign-in). GET: admins read the enquiries.
export const POST = publicRoute(async ({ req }) => createLead(await req.json().catch(() => ({})), await clientIp()));
export const GET = route(async ({ user }) => listLeads(user));
