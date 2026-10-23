import { requirePageUser } from "@/server/session";
import { AvailabilityClient } from "./availability-client";

export const metadata = { title: "Availability" };

export default async function AvailabilityPage() {
  await requirePageUser();
  return <AvailabilityClient />;
}
