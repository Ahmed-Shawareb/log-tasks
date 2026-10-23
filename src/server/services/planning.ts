import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { addDays, startOfZonedDay } from "@/lib/time";
import { forbidden, invalid } from "../errors";
import { audit } from "../audit";
import { isAdmin, isManager, peopleScope, taskScope, type SessionUser } from "../permissions";
import { taskListInclude, buildTaskWhere, type TaskFilters } from "./tasks";

/** Calendar feed: scheduled blocks + deadlines + leave in [from, to). */
export async function calendarFeed(actor: SessionUser, from: Date, to: Date, f: TaskFilters) {
  const where = buildTaskWhere(actor, f);
  const [scheduled, deadlines, unscheduled, leaves] = await Promise.all([
    db.task.findMany({ where: { AND: [where, { scheduledStart: { lt: to }, scheduledEnd: { gt: from } }] }, include: taskListInclude, take: 1000 }),
    db.task.findMany({ where: { AND: [where, { dueAt: { gte: from, lt: to } }] }, include: taskListInclude, take: 1000 }),
    db.task.findMany({
      where: { AND: [where, { scheduledStart: null, status: { notIn: ["APPROVED", "CANCELLED", "SUBMITTED"] } }] },
      include: taskListInclude, orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { priority: "desc" }], take: 100,
    }),
    db.leave.findMany({
      where: { user: peopleScope(actor), startsAt: { lt: to }, endsAt: { gt: from }, ...(f.assigneeId ? { userId: f.assigneeId } : {}) },
      include: { user: { select: { id: true, name: true, avatarColor: true } } },
    }),
  ]);
  return { scheduled, deadlines, unscheduled, leaves };
}

/** Team board: one lane per person, a column per day, with capacity. */
export async function workloadBoard(actor: SessionUser, opts: { start?: string; days?: number; department?: string; teamId?: string; projectId?: string }) {
  if (!isManager(actor)) throw forbidden("The team schedule is for managers.");
  const start = opts.start ? startOfZonedDay(new Date(opts.start)) : startOfZonedDay(new Date());
  const days = Math.min(Math.max(opts.days ?? 7, 1), 14);
  const end = addDays(start, days);
  const peopleWhere: Prisma.UserWhereInput = {
    AND: [
      peopleScope(actor),
      { isActive: true, role: { in: ["EMPLOYEE", "PERFORMANCE_MANAGER", "PRODUCTION_MANAGER", ...(isAdmin(actor) ? ["ACCOUNT_MANAGER" as const] : [])] } },
      opts.department ? { department: { key: opts.department } } : {},
      opts.teamId ? { memberships: { some: { teamId: opts.teamId } } } : {},
    ],
  };
  const people = await db.user.findMany({
    where: peopleWhere,
    select: {
      id: true, name: true, avatarColor: true, title: true, role: true, workDays: true, workStartMin: true, workEndMin: true, weeklyCapacityMin: true,
      department: { select: { key: true, name: true, color: true } },
    },
    orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
  });
  const ids = people.map((p) => p.id);
  const scope = { AND: [taskScope(actor), { archivedAt: null }, opts.projectId ? { projectId: opts.projectId } : {}] };
  const [tasks, leaves, unassigned] = await Promise.all([
    db.task.findMany({
      where: {
        AND: [scope, { assigneeId: { in: ids }, status: { notIn: ["CANCELLED"] } }, {
          OR: [{ scheduledStart: { lt: end }, scheduledEnd: { gt: start } }, { dueAt: { gte: start, lt: end } }, { scheduledStart: null, dueAt: null, status: { notIn: ["APPROVED"] } }],
        }],
      },
      include: taskListInclude,
      orderBy: [{ scheduledStart: "asc" }, { dueAt: "asc" }],
    }),
    db.leave.findMany({ where: { userId: { in: ids }, startsAt: { lt: end }, endsAt: { gt: start } } }),
    db.task.findMany({ where: { AND: [scope, { assigneeId: null, status: { notIn: ["APPROVED", "CANCELLED"] } }] }, include: taskListInclude, orderBy: { dueAt: { sort: "asc", nulls: "last" } }, take: 60 }),
  ]);
  const openGroups = await db.task.groupBy({
    by: ["assigneeId"],
    where: { AND: [scope, { assigneeId: { in: ids }, status: { notIn: ["APPROVED", "CANCELLED"] } }] },
    _count: true,
  });
  const openCounts = Object.fromEntries(openGroups.map((g) => [g.assigneeId!, g._count]));
  return { start: start.toISOString(), days, people, tasks, leaves, unassigned, openCounts };
}

// ───────────────────────────── templates ─────────────────────────────

export const templateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().max(5000).nullable().optional(),
  department: z.string().nullable().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  checklist: z.array(z.string().trim().min(1).max(300)).max(50).default([]),
  subtasks: z.array(z.object({
    title: z.string().trim().min(2).max(200), departmentKey: z.string().optional(),
    estimateMinutes: z.number().int().min(0).max(10_000).optional(), offsetDays: z.number().int().min(0).max(365).optional(),
  })).max(30).default([]),
});

export const listTemplates = () => db.taskTemplate.findMany({ include: { department: true }, orderBy: { name: "asc" } });

export async function saveTemplate(actor: SessionUser, raw: unknown, id?: string) {
  if (!isManager(actor)) throw forbidden();
  const input = templateSchema.parse(raw);
  const dept = input.department ? await db.department.findUnique({ where: { key: input.department } }) : null;
  if (input.department && !dept) throw invalid("Unknown department.");
  const data = {
    name: input.name, description: input.description ?? null, departmentId: dept?.id ?? null, priority: input.priority ?? "MEDIUM",
    blueprint: { checklist: input.checklist, subtasks: input.subtasks },
  };
  const t = id ? await db.taskTemplate.update({ where: { id }, data }) : await db.taskTemplate.create({ data: { ...data, createdById: actor.id } });
  await audit(actor, id ? "template.update" : "template.create", "TaskTemplate", t.id, { after: { name: t.name } });
  return t;
}

export async function deleteTemplate(actor: SessionUser, id: string) {
  if (!isAdmin(actor) && !isManager(actor)) throw forbidden();
  await db.taskTemplate.delete({ where: { id } });
  await audit(actor, "template.delete", "TaskTemplate", id);
}

// ───────────────────────────── search & audit ─────────────────────────────

export async function globalSearch(actor: SessionUser, q: string) {
  const term = q.trim().slice(0, 100);
  if (term.length < 2) return { tasks: [], projects: [], people: [] };
  const num = Number(term.replace(/^log-/i, ""));
  const [tasks, projects, people] = await Promise.all([
    db.task.findMany({
      where: { AND: [taskScope(actor), { archivedAt: null }, { OR: [{ title: { contains: term, mode: "insensitive" } }, ...(Number.isInteger(num) && num > 0 ? [{ number: num }] : [])] }] },
      select: { id: true, number: true, title: true, status: true, project: { select: { name: true } } }, take: 8, orderBy: { updatedAt: "desc" },
    }),
    actor.role === "EMPLOYEE" ? Promise.resolve([]) : db.project.findMany({
      where: { AND: [isAdmin(actor) ? {} : actor.role === "ACCOUNT_MANAGER" ? { accountManagerId: actor.id } : { tasks: { some: taskScope(actor) } }, { OR: [{ name: { contains: term, mode: "insensitive" } }, { client: { name: { contains: term, mode: "insensitive" } } }] }] },
      select: { id: true, name: true, client: { select: { name: true } } }, take: 5,
    }),
    isManager(actor) ? db.user.findMany({ where: { AND: [peopleScope(actor), { isActive: true, name: { contains: term, mode: "insensitive" } }] }, select: { id: true, name: true, avatarColor: true, title: true }, take: 5 }) : Promise.resolve([]),
  ]);
  return { tasks, projects, people };
}

export async function listAudit(actor: SessionUser, opts: { q?: string; entityType?: string; page?: number }) {
  if (!isAdmin(actor)) throw forbidden("Administrator access required.");
  const where: Prisma.AuditLogWhereInput = {
    AND: [
      opts.entityType ? { entityType: opts.entityType } : {},
      opts.q ? { OR: [{ action: { contains: opts.q, mode: "insensitive" } }, { actorEmail: { contains: opts.q, mode: "insensitive" } }, { entityId: opts.q }] } : {},
    ],
  };
  const page = Math.max(1, opts.page ?? 1);
  const [items, total] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 50, take: 50 }),
    db.auditLog.count({ where }),
  ]);
  return { items, total, page };
}
