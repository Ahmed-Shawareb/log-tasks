import { requirePageRole } from "@/server/session";
import { FeedsClient } from "./feeds-client";

export const metadata = { title: "Social feeds" };

export default async function FeedsPage() {
  await requirePageRole(["ADMIN", "ACCOUNT_MANAGER", "SOCIAL_MEDIA_SPECIALIST"]);
  return <FeedsClient />;
}
