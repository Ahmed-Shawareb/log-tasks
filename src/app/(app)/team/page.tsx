import { requirePageRole } from "@/server/session";
import { TeamClient } from "./team-client";

export const metadata = { title: "Team schedule" };

export default async function TeamPage() {
  await requirePageRole(["ADMIN", "ACCOUNT_MANAGER", "PERFORMANCE_MANAGER", "PRODUCTION_MANAGER"]);
  return <TeamClient />;
}
