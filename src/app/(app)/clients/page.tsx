import { requirePageRole } from "@/server/session";
import { ClientsClient } from "./clients-client";

export const metadata = { title: "Clients" };

export default async function ClientsPage() {
  await requirePageRole(["ADMIN", "ACCOUNT_MANAGER", "PERFORMANCE_MANAGER", "PRODUCTION_MANAGER"]);
  return <ClientsClient />;
}
