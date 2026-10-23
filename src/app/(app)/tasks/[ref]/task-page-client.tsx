"use client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TaskDetailView } from "@/components/tasks/task-detail";

export function TaskPageClient({ id }: { id: string }) {
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link href="/tasks" className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg"><ArrowLeft className="h-3.5 w-3.5" /> All tasks</Link>
      <TaskDetailView id={id} variant="page" />
    </div>
  );
}
