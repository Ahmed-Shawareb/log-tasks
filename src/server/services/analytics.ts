import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { pct } from "@/lib/utils";
import { addDays, companyTz, startOfZonedDay, zonedParts } from "@/lib/time";
import { peopleScope, taskScope, type SessionUser } from "../permissions";

export type RangeKey = "today" | "7d" | "30d" | "90d" | "custom";

export function resolveRange(range?: string, from?: string, to?: string) {
  const now = new Date();
  const todayStart = startOfZonedDay(now);
  const end = to ? addDays(startOfZonedDay(new Date(to)), 1) : addDays(todayStart, 1);
  let start: Date;
  let key: RangeKey = (range as RangeKey) || "30d";
  if (key === "custom" && from) start = startOfZonedDay(new Date(from));
  else if (key === "today") start = todayStart;
  else if (key === "7d") start = addDays(todayStart, -6);
  else if (key === "90d") start = addDays(todayStart, -89);
  else {
    key = key === "custom" ? "custom" : "30d";
    start = addDays(todayStart, -29);
  }
  if (start >= end) start = addDays(end, -1);
  return { key, start, end };
}

const dayKey = (d: Date) => {
  const z = zonedParts(d, companyTz());
  return `${z.year}-${String(z.month).padStart(2, "0")}-${String(z.day).padStart(2, "0")}`;
};

/**
 * Metric definitions (shown in the UI as tooltips):
 * - Open: not Approved/Cancelled, not archived.
 * - Completed: approved (completedAt) within the range.
 * - Overdue: open with a deadline before now.
 * - Completion rate: of tasks created in the range (excluding cancelled), the share already approved.
 * - On-time rate: of tasks approved in the range that had a deadline, the share approved on or before it.
 */
export async function dashboardData(actor: SessionUser, range: { start: Date; end: Date }) {
  const scope: Prisma.TaskWhereInput = { AND: [taskScope(actor), { archivedAt: null }] };
  const now = new Date();
  const open = { status: { notIn: ["APPROVED", "CANCELLED"] as ("APPROVED" | "CANCELLED")[] } };
  const inRange = { gte: range.start, lt: range.end };

  const [
    openCount, overdue, awaitingReview, blocked, changesRequested, inProgress,
    completed, createdInRange, statusGroups, completedWithDue, createdRows, completedRows,
  ] = await Promise.all([
    db.task.count({ where: { AND: [scope, open] } }),
    db.task.count({ where: { AND: [scope, open, { dueAt: { lt: now } }] } }),
    db.task.count({ where: { AND: [scope, { status: "SUBMITTED" }] } }),
    db.task.count({ where: { AND: [scope, { status: "BLOCKED" }] } }),
    db.task.count({ where: { AND: [scope, { status: "CHANGES_REQUESTED" }] } }),
    db.task.count({ where: { AND: [scope, { status: "IN_PROGRESS" }] } }),
    db.task.count({ where: { AND: [scope, { status: "APPROVED", completedAt: inRange }] } }),
    db.task.groupBy({ by: ["status"], where: { AND: [scope, { createdAt: inRange, status: { not: "CANCELLED" } }] }, _count: true }),
    db.task.groupBy({ by: ["status"], where: scope, _count: true }),
    db.task.findMany({ where: { AND: [scope, { status: "APPROVED", completedAt: inRange, dueAt: { not: null } }] }, select: { completedAt: true, dueAt: true } }),
    db.task.findMany({ where: { AND: [scope, { createdAt: inRange }] }, select: { createdAt: true } }),
    db.task.findMany({ where: { AND: [scope, { status: "APPROVED", completedAt: inRange }] }, select: { completedAt: true } }),
  ]);

  const createdTotal = createdInRange.reduce((a, r) => a + r._count, 0);
  const createdApproved = createdInRange.find((r) => r.status === "APPROVED")?._count ?? 0;
  const onTime = completedWithDue.filter((t) => t.completedAt! <= t.dueAt!).length;

  // Daily series (company-local days).
  const days: { day: string; created: number; completed: number }[] = [];
  const index = new Map<string, number>();
  for (let d = range.start; d < range.end && days.length < 120; d = addDays(d, 1)) {
    const k = dayKey(new Date(d.getTime() + 12 * 3600_000));
    if (index.has(k)) continue;
    index.set(k, days.length);
    days.push({ day: k, created: 0, completed: 0 });
  }
  for (const r of createdRows) { const i = index.get(dayKey(r.createdAt)); if (i !== undefined) days[i]!.created++; }
  for (const r of completedRows) { const i = index.get(dayKey(r.completedAt!)); if (i !== undefined) days[i]!.completed++; }

  // Workload by department and by person (open work).
  const openTasks = await db.task.findMany({
    where: { AND: [scope, open] },
    select: {
      id: true, estimateMinutes: true, dueAt: true, status: true, scheduledStart: true, scheduledEnd: true,
      department: { select: { key: true, name: true, color: true } },
      assignee: { select: { id: true, name: true, avatarColor: true, weeklyCapacityMin: true } },
    },
  });
  const byDept = new Map<string, { name: string; color: string; open: number; overdue: number; estimateMin: number }>();
  const byPerson = new Map<string, { id: string; name: string; color: string; open: number; overdue: number; inReview: number; scheduledMin: number; capacityMin: number }>();
  const weekStart = startOfZonedDay(now), weekEnd = addDays(weekStart, 7);
  for (const t of openTasks) {
    const dk = t.department?.key ?? "NONE";
    const d = byDept.get(dk) ?? { name: t.department?.name ?? "Unassigned", color: t.department?.color ?? "#64748b", open: 0, overdue: 0, estimateMin: 0 };
    d.open++;
    if (t.dueAt && t.dueAt < now) d.overdue++;
    d.estimateMin += t.estimateMinutes ?? 0;
    byDept.set(dk, d);
    if (t.assignee) {
      const p = byPerson.get(t.assignee.id) ?? { id: t.assignee.id, name: t.assignee.name, color: t.assignee.avatarColor, open: 0, overdue: 0, inReview: 0, scheduledMin: 0, capacityMin: t.assignee.weeklyCapacityMin };
      p.open++;
      if (t.dueAt && t.dueAt < now) p.overdue++;
      if (t.status === "SUBMITTED") p.inReview++;
      if (t.scheduledStart && t.scheduledEnd && t.scheduledStart < weekEnd && t.scheduledEnd > weekStart) {
        p.scheduledMin += Math.round((t.scheduledEnd.getTime() - t.scheduledStart.getTime()) / 60_000);
      }
      byPerson.set(t.assignee.id, p);
    }
  }

  const [upcoming, recentActivity, projects] = await Promise.all([
    db.task.findMany({
      where: { AND: [scope, open, { dueAt: { gte: now } }] }, orderBy: { dueAt: "asc" }, take: 8,
      select: { id: true, number: true, title: true, dueAt: true, priority: true, status: true, assignee: { select: { name: true, avatarColor: true } }, project: { select: { name: true, color: true } } },
    }),
    db.activity.findMany({
      where: { task: scope }, orderBy: { createdAt: "desc" }, take: 14,
      include: { actor: { select: { name: true, avatarColor: true } }, task: { select: { number: true, title: true } } },
    }),
    db.task.groupBy({ by: ["projectId", "status"], where: { AND: [scope, { projectId: { not: null } }] }, _count: true }),
  ]);
  const projectIds = [...new Set(projects.map((p) => p.projectId!))];
  const projectRows = await db.project.findMany({ where: { id: { in: projectIds }, status: { not: "ARCHIVED" } }, select: { id: true, name: true, color: true, targetDate: true, client: { select: { name: true } } } });
  const projectProgress = projectRows.map((p) => {
    const rows = projects.filter((r) => r.projectId === p.id);
    const total = rows.filter((r) => r.status !== "CANCELLED").reduce((a, r) => a + r._count, 0);
    const done = rows.find((r) => r.status === "APPROVED")?._count ?? 0;
    return { ...p, total, done, progress: total ? Math.round((done / total) * 100) : 0 };
  }).sort((a, b) => b.total - a.total).slice(0, 8);

  return {
    kpis: {
      open: openCount, overdue, awaitingReview, blocked, changesRequested, inProgress, completed,
      activeProjects: projectRows.length,
      completionRate: pct(createdApproved, createdTotal),
      onTimeRate: pct(onTime, completedWithDue.length),
      createdInRange: createdTotal,
    },
    statusDistribution: statusGroups.map((g) => ({ status: g.status, count: g._count })),
    daily: days,
    workloadByDepartment: [...byDept.values()].sort((a, b) => b.open - a.open),
    workloadByPerson: [...byPerson.values()].sort((a, b) => b.open - a.open),
    upcoming,
    recentActivity,
    projectProgress,
  };
}

/** Personal widgets for the employee dashboard. */
export async function myWork(actor: SessionUser) {
  const now = new Date();
  const todayStart = startOfZonedDay(now), tomorrow = addDays(todayStart, 1);
  const base = { assigneeId: actor.id, archivedAt: null };
  const select = {
    id: true, number: true, title: true, dueAt: true, priority: true, status: true, scheduledStart: true, scheduledEnd: true,
    project: { select: { name: true, color: true } },
  } as const;
  const open = { notIn: ["APPROVED", "CANCELLED"] as ("APPROVED" | "CANCELLED")[] };
  const [dueToday, upcoming, overdue, returned, inReview, recentlyDone, todaySchedule, minutesThisWeek] = await Promise.all([
    db.task.findMany({ where: { ...base, status: open, dueAt: { gte: todayStart, lt: tomorrow } }, select, orderBy: { dueAt: "asc" } }),
    db.task.findMany({ where: { ...base, status: open, dueAt: { gte: tomorrow, lt: addDays(todayStart, 8) } }, select, orderBy: { dueAt: "asc" }, take: 10 }),
    db.task.findMany({ where: { ...base, status: open, dueAt: { lt: now } }, select, orderBy: { dueAt: "asc" } }),
    db.task.findMany({ where: { ...base, status: "CHANGES_REQUESTED" }, select, orderBy: { updatedAt: "desc" } }),
    db.task.findMany({ where: { ...base, status: "SUBMITTED" }, select, orderBy: { updatedAt: "desc" } }),
    db.task.findMany({ where: { ...base, status: "APPROVED" }, select: { ...select, completedAt: true }, orderBy: { completedAt: "desc" }, take: 6 }),
    db.task.findMany({ where: { ...base, status: open, scheduledStart: { lt: tomorrow }, scheduledEnd: { gt: todayStart } }, select, orderBy: { scheduledStart: "asc" } }),
    db.timeEntry.aggregate({ where: { userId: actor.id, startedAt: { gte: addDays(todayStart, -6) } }, _sum: { minutes: true } }),
  ]);
  return { dueToday, upcoming, overdue, returned, inReview, recentlyDone, todaySchedule, minutesThisWeek: minutesThisWeek._sum.minutes ?? 0 };
}

/** Per-person delivery performance for managers and the reports page. */
export async function peoplePerformance(actor: SessionUser, range: { start: Date; end: Date }) {
  const people = await db.user.findMany({
    where: { AND: [peopleScope(actor), { isActive: true, role: { in: ["EMPLOYEE", "PERFORMANCE_MANAGER", "PRODUCTION_MANAGER"] } }] },
    select: { id: true, name: true, avatarColor: true, title: true, department: { select: { name: true, key: true } } },
    orderBy: { name: "asc" },
  });
  const scope = taskScope(actor);
  const out = [];
  for (const p of people) {
    const where = { AND: [scope, { assigneeId: p.id, archivedAt: null }] };
    const [open, overdue, approved, submissions, minutes] = await Promise.all([
      db.task.count({ where: { AND: [where, { status: { notIn: ["APPROVED", "CANCELLED"] } }] } }),
      db.task.count({ where: { AND: [where, { status: { notIn: ["APPROVED", "CANCELLED"] }, dueAt: { lt: new Date() } }] } }),
      db.task.findMany({ where: { AND: [where, { status: "APPROVED", completedAt: { gte: range.start, lt: range.end } }] }, select: { dueAt: true, completedAt: true, _count: { select: { submissions: true } } } }),
      db.review.count({ where: { decision: "CHANGES_REQUESTED", createdAt: { gte: range.start, lt: range.end }, submission: { submitterId: p.id, task: scope } } }),
      db.timeEntry.aggregate({ where: { userId: p.id, startedAt: { gte: range.start, lt: range.end }, task: scope }, _sum: { minutes: true } }),
    ]);
    const withDue = approved.filter((t) => t.dueAt);
    out.push({
      ...p, open, overdue, completed: approved.length,
      onTimeRate: pct(withDue.filter((t) => t.completedAt! <= t.dueAt!).length, withDue.length),
      avgRevisions: approved.length ? Math.round((approved.reduce((a, t) => a + t._count.submissions, 0) / approved.length) * 10) / 10 : null,
      changesRequested: submissions,
      loggedMinutes: minutes._sum.minutes ?? 0,
    });
  }
  return out;
}
