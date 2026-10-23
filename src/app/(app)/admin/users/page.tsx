import { requirePageRole } from "@/server/session";
import { UsersClient } from "./users-client";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  await requirePageRole(["ADMIN"]);
  return <UsersClient />;
}
