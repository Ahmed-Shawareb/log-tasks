import { Aurora } from "@/components/aurora";
import { AppProvider } from "@/components/app-context";
import { Shell } from "@/components/shell";
import { TaskDrawerHost } from "@/components/tasks/task-detail";
import { TaskFormModal } from "@/components/tasks/task-form";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requirePageUser } from "@/server/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  // Signed in with a one-time / shared password: nowhere else until they pick their own.
  if (user.mustChangePassword && !((await headers()).get("x-pathname") ?? "").startsWith("/settings")) redirect("/settings?changePassword=1");
  return (
    <AppProvider user={user}>
      <Aurora />
      <Shell>{children}</Shell>
      <TaskDrawerHost />
      <TaskFormModal />
    </AppProvider>
  );
}
