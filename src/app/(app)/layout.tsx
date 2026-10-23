import { Aurora } from "@/components/aurora";
import { AppProvider } from "@/components/app-context";
import { Shell } from "@/components/shell";
import { TaskDrawerHost } from "@/components/tasks/task-detail";
import { TaskFormModal } from "@/components/tasks/task-form";
import { requirePageUser } from "@/server/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  return (
    <AppProvider user={user}>
      <Aurora />
      <Shell>{children}</Shell>
      <TaskDrawerHost />
      <TaskFormModal />
    </AppProvider>
  );
}
