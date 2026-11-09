import { requirePageUser } from "@/server/session";
import { MyGridsClient } from "./my-grids-client";

export const metadata = { title: "Grids" };

export default async function MyGridsPage() {
  await requirePageUser();
  return <MyGridsClient />;
}
