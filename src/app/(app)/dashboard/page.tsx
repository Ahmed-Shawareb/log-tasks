import { requirePageUser } from "@/server/session";
import { dashboardData, myWork, resolveRange } from "@/server/services/analytics";
import { DashboardClient } from "./dashboard-client";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const range = resolveRange(sp.range, sp.from, sp.to);
  const [data, mine] = await Promise.all([dashboardData(user, range), myWork(user)]);
  return (
    <DashboardClient
      data={JSON.parse(JSON.stringify(data))}
      mine={JSON.parse(JSON.stringify(mine))}
      range={{ key: range.key, from: sp.from ?? "", to: sp.to ?? "" }}
      denied={sp.denied === "1"}
    />
  );
}
