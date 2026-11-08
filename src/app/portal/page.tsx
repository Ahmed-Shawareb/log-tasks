import { redirect } from "next/navigation";
import { requirePortalPage } from "@/server/portal";
import { PortalDashboard } from "./portal-dashboard";

export const metadata = { title: "Your dashboard" };

export default async function PortalPage() {
  const u = await requirePortalPage();
  if (u.personal) redirect("/space"); // personal clients use the unbranded dashboard
  return <PortalDashboard clientName={u.clientName} onboarded={u.onboarded} />;
}
