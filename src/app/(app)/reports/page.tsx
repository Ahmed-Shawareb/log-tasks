import { requirePageRole } from "@/server/session";
import { ReportsClient } from "./reports-client";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  await requirePageRole(["ADMIN", "ACCOUNT_MANAGER", "PERFORMANCE_MANAGER", "PRODUCTION_MANAGER"]);
  return <ReportsClient />;
}
