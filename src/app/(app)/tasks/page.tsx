import { Suspense } from "react";
import { TaskListClient } from "./task-list-client";

export const metadata = { title: "Tasks" };

export default function TasksPage() {
  return <Suspense><TaskListClient /></Suspense>;
}
