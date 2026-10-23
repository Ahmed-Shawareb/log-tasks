import { requirePageRole } from "@/server/session";
import { AuditClient } from "./audit-client";

export const metadata = { title: "Audit log" };

export default async function AuditPage() {
  await requirePageRole(["ADMIN"]);
  return <AuditClient />;
}
