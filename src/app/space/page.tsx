import { redirect } from "next/navigation";
import { requirePortalPage } from "@/server/portal";
import { PortalDashboard } from "../portal/portal-dashboard";

export const metadata = { title: { absolute: "Your dashboard" } };

export default async function SpacePage() {
  const u = await requirePortalPage("/space/login");
  if (!u.personal) redirect("/portal"); // LOG clients keep the LOG dashboard
  return <PortalDashboard clientName={u.clientName} onboarded={u.onboarded} personal />;
}
