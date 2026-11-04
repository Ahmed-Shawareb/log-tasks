import { redirect } from "next/navigation";
import { getPortalUser } from "@/server/portal";
import { PortalLoginForm } from "./portal-login-form";

export const metadata = { title: "Client sign in" };

export default async function PortalLoginPage() {
  if (await getPortalUser()) redirect("/portal");
  return <PortalLoginForm />;
}
