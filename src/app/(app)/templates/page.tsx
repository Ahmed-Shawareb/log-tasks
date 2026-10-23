import { requirePageRole } from "@/server/session";
import { TemplatesClient } from "./templates-client";

export const metadata = { title: "Templates" };

export default async function TemplatesPage() {
  await requirePageRole(["ADMIN", "ACCOUNT_MANAGER", "PERFORMANCE_MANAGER", "PRODUCTION_MANAGER"]);
  return <TemplatesClient />;
}
