import { requirePageUser } from "@/server/session";
import { MyTasksClient } from "./my-tasks-client";

export const metadata = { title: "Tasks" };

export default async function MyTasksPage() {
  await requirePageUser();
  return <MyTasksClient />;
}
