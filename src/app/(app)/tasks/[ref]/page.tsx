import { TaskPageClient } from "./task-page-client";

export const metadata = { title: "Task" };

export default async function TaskPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  return <TaskPageClient id={ref.replace(/^log-/i, "")} />;
}
