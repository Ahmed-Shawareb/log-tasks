import { redirect } from "next/navigation";
import { getPortalUser } from "@/server/portal";
import { PortalLoginForm } from "../../portal/login/portal-login-form";

export const metadata = { title: { absolute: "Sign in" } };

export default async function SpaceLoginPage() {
  const u = await getPortalUser();
  if (u) redirect(u.personal ? "/space" : "/portal");
  return <PortalLoginForm personal />;
}
