import { requirePageRole } from "@/server/session";
import { TeamsClient } from "./teams-client";

export const metadata = { title: "Teams" };

export default async function TeamsPage() {
  await requirePageRole(["ADMIN"]);
  return <TeamsClient />;
}
