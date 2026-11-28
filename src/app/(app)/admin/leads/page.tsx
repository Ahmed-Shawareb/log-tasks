import { requirePageRole } from "@/server/session";
import { LeadsClient } from "./leads-client";

export const metadata = { title: "Leads" };

export default async function LeadsPage() {
  await requirePageRole(["ADMIN"]);
  return <LeadsClient />;
}
