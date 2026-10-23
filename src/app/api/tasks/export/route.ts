import { route, searchParams } from "@/server/api";
import { listTasks, taskFilterSchema } from "@/server/services/tasks";
import { STATUS_META, type StatusKey } from "@/lib/constants";
import { isOverdue, taskRef } from "@/lib/utils";

const cell = (v: unknown) => {
  let s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralise spreadsheet formula injection
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const GET = route(async ({ req, user }) => {
  const f = taskFilterSchema.parse({ ...searchParams(req), pageSize: 500, page: 1 });
  const { items } = await listTasks(user, f);
  const header = ["Ref", "Title", "Status", "Priority", "Overdue", "Assignee", "Department", "Client", "Project", "Start", "Deadline", "Scheduled start", "Scheduled end", "Estimate (min)", "Completed", "Labels"];
  const rows = items.map((t) => [
    taskRef(t.number), t.title, STATUS_META[t.status as StatusKey].label, t.priority, isOverdue(t) ? "yes" : "no", t.assignee?.name, t.department?.name,
    t.project?.client.name, t.project?.name, t.startDate, t.dueAt, t.scheduledStart, t.scheduledEnd, t.estimateMinutes, t.completedAt, t.labels.join(" "),
  ]);
  const csv = [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  return new Response("﻿" + csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="log-tasks-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
});
