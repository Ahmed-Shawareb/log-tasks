import { requirePortalPage } from "@/server/portal";
import { PortalDashboard } from "./portal-dashboard";

export const metadata = { title: "Your dashboard" };

export default async function PortalPage() {
  const u = await requirePortalPage();
  return <PortalDashboard clientName={u.clientName} onboarded={u.onboarded} />;
}
