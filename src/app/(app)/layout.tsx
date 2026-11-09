import { Aurora } from "@/components/aurora";
import { AppProvider } from "@/components/app-context";
import { Shell } from "@/components/shell";
import { TaskDrawerHost } from "@/components/tasks/task-detail";
import { TaskFormModal } from "@/components/tasks/task-form";
import { StaffWelcome } from "@/components/welcome";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requirePageUser } from "@/server/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  // Signed in with a one-time / shared password: nowhere else until they pick their own.
  const path = (await headers()).get("x-pathname") ?? "";
  if (user.mustChangePassword && !path.startsWith("/settings")) redirect("/settings?changePassword=1");
  // Externals see nothing of the agency: only their own calendar, tasks and grids (and their settings).
  if (user.role === "EXTERNAL" && !/^\/(my-calendar|my-tasks|my-grids|settings)(\/|$)/.test(path)) redirect("/my-calendar");
  return (
    <AppProvider user={user}>
      <Aurora />
      <Shell>{children}</Shell>
      <TaskDrawerHost />
      <TaskFormModal />
      <StaffWelcome />
    </AppProvider>
  );
}
