import { redirect } from "next/navigation";
import { getPortalUser } from "@/server/portal";
import { PortalLoginForm } from "./portal-login-form";

export const metadata = { title: "Client sign in" };

export default async function PortalLoginPage() {
  const u = await getPortalUser();
  if (u) redirect(u.personal ? "/space" : "/portal");
  return <PortalLoginForm />;
}
