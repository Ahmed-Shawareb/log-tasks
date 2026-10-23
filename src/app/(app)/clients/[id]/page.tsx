import { requirePageRole } from "@/server/session";
import { ClientDetailClient } from "./client-detail-client";

export const metadata = { title: "Client" };

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageRole(["ADMIN", "ACCOUNT_MANAGER", "PERFORMANCE_MANAGER", "PRODUCTION_MANAGER"]);
  const { id } = await params;
  return <ClientDetailClient id={id} />;
}
