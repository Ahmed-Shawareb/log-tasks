import { requirePageRole } from "@/server/session";
import { TaskTypesClient } from "./task-types-client";

export const metadata = { title: "Task types" };

export default async function TaskTypesPage() {
  await requirePageRole(["ADMIN"]);
  return <TaskTypesClient />;
}
