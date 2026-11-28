import type { Metadata } from "next";
import { getCurrentUser } from "@/server/session";
import { getPortalUser } from "@/server/portal";
import { SiteHome } from "@/components/site/SiteHome";

// The public face of LOG: the brand website, with the way in to the team's system and the clients' dashboards.
export const metadata: Metadata = {
  title: { absolute: "LOG — Lots Of Growth" },
  description: "LOG — Lots Of Growth is a full-spectrum marketing agency: UGC, content creation, media production, performance marketing, branding and social media.",
  robots: { index: true, follow: true },
};

export default async function Home() {
  const [staff, client] = await Promise.all([getCurrentUser(), getPortalUser()]);
  return <SiteHome signedIn={{ staff: !!staff, client: client ? (client.personal ? "space" : "portal") : null }} />;
}
