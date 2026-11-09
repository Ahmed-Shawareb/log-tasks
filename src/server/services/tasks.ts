import "server-only";
import { z } from "zod";
import { Prisma, type Priority, type Task as TaskRow, type TaskStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { taskRef } from "@/lib/utils";
import { CLOSED_STATUSES, DOER_ROLES, STATUS_META, isWorkerRole, type StatusKey } from "@/lib/constants";
import { canSubmit, canBeReviewed, canTransition } from "@/lib/workflow";
import { AppError, forbidden, invalid, notFound } from "../errors";
import { activity, audit, notify } from "../audit";
import { toSessionUser } from "../auth";
import {
  canManageTask, canReviewTask, canUseDepartment, isAccountManager, isAdmin, isDeptManager, isManager, managerDeptKey,
  canUseExternals, notPlan, privateProjectGuard, SHARED_DEPARTMENTS, taskScope, type SessionUser,
} from "../permissions";
import { checkAvailability, lockPerson } from "./availability";
import { zonedParts } from "@/lib/time";

type Tx = Prisma.TransactionClient;

// ───────────────────────────── shapes ─────────────────────────────

const personSelect = { id: true, name: true, avatarColor: true, email: true, role: true } as const;

export const taskListInclude = {
  assignee: { select: personSelect },
  reviewer: { select: personSelect },
  project: { select: { id: true, name: true, color: true, kind: true, accountManagerId: true, client: { select: { id: true, name: true } } } },
  department: { select: { id: true, key: true, name: true, color: true } },
  type: { select: { id: true, name: true, unit: true, unitPlural: true, icon: true, color: true, stages: true } },
  parent: { select: { id: true, number: true, title: true } },
  _count: { select: { children: true, comments: true, attachments: true, submissions: true } },
} satisfies Prisma.TaskInclude;

export type TaskListItem = Prisma.TaskGetPayload<{ include: typeof taskListInclude }>;

const permInclude = {
  department: { select: { key: true } },
  project: { select: { accountManagerId: true } },
} satisfies Prisma.TaskInclude;

async function loadForActor(tx: Tx | typeof db, actor: SessionUser, id: string) {
  const task = await tx.task.findFirst({ where: { AND: [{ id }, taskScope(actor)] }, include: permInclude });
  if (!task) throw notFound("Task"); // also for out-of-scope ids: never confirm existence
  return task;
}

/** Optimistic concurrency: the write succeeds only if nobody changed the task since `version` was read. */
async function bump(tx: Tx, id: string, version: number | undefined, data: Prisma.TaskUncheckedUpdateManyInput) {
  const res = await tx.task.updateMany({
    where: { id, ...(version !== undefined ? { version } : {}) },
    data: { ...data, version: { increment: 1 } },
  });
  if (res.count === 0) {
    throw new AppError("CONFLICT", "This task was just changed by someone else. Refresh to see the latest version, then try again.");
  }
}

const statusLabel = (s: string) => STATUS_META[s as StatusKey]?.label ?? s;
const link = (number: number) => `/tasks/${number}`;

// ───────────────────────────── listing ─────────────────────────────

export const taskFilterSchema = z.object({
  q: z.string().max(200).optional(),
  status: z.string().optional(), // comma separated
  priority: z.string().optional(),
  assigneeId: z.string().optional(),
  department: z.string().optional(),
  projectId: z.string().optional(),
  clientId: z.string().optional(),
  teamId: z.string().optional(),
  parentId: z.string().optional(),
  topLevel: z.string().optional(),
  overdue: z.string().optional(),
  scheduled: z.enum(["yes", "no"]).optional(),
  dueFrom: z.string().optional(),
  dueTo: z.string().optional(),
  archived: z.string().optional(),
  mine: z.string().optional(),
  plans: z.string().optional(), // "1": include staged orders (the slider); "only": just them
  needsReview: z.string().optional(),
  label: z.string().optional(),
  sort: z.enum(["due", "priority", "created", "updated", "number", "title", "status"]).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(500).optional(),
});
export type TaskFilters = z.infer<typeof taskFilterSchema>;

export function buildTaskWhere(actor: SessionUser, f: TaskFilters): Prisma.TaskWhereInput {
  const and: Prisma.TaskWhereInput[] = [taskScope(actor)];
  and.push(f.archived === "1" ? { archivedAt: { not: null } } : { archivedAt: null });
  if (f.q) {
    const num = Number(f.q.replace(/^log-/i, ""));
    and.push({
      OR: [
        { title: { contains: f.q, mode: "insensitive" } },
        { description: { contains: f.q, mode: "insensitive" } },
        { labels: { has: f.q.toLowerCase() } },
        ...(Number.isInteger(num) && num > 0 ? [{ number: num }] : []),
      ],
    });
  }
  if (f.status) and.push({ status: { in: f.status.split(",") as TaskStatus[] } });
  if (f.priority) and.push({ priority: { in: f.priority.split(",") as Priority[] } });
  if (f.assigneeId) and.push(f.assigneeId === "none" ? { assigneeId: null } : { assigneeId: f.assigneeId });
  if (f.mine === "1") and.push({ assigneeId: actor.id });
  if (f.department) and.push({ department: { key: f.department } });
  if (f.projectId) and.push({ projectId: f.projectId });
  if (f.clientId) and.push({ project: { clientId: f.clientId } });
  if (f.teamId) and.push({ assignee: { memberships: { some: { teamId: f.teamId } } } });
  if (f.parentId) and.push({ parentId: f.parentId });
  if (f.plans === "only") and.push({ NOT: notPlan });
  else if (f.plans !== "1" && !f.parentId) and.push(notPlan);
  if (f.topLevel === "1") and.push({ parentId: null });
  if (f.label) and.push({ labels: { has: f.label.toLowerCase() } });
  if (f.overdue === "1") and.push({ dueAt: { lt: new Date() }, status: { notIn: CLOSED_STATUSES } });
  if (f.needsReview === "1") and.push({ status: "SUBMITTED" });
  if (f.scheduled === "yes") and.push({ scheduledStart: { not: null } });
  if (f.scheduled === "no") and.push({ scheduledStart: null });
  if (f.dueFrom || f.dueTo) {
    and.push({ dueAt: { ...(f.dueFrom ? { gte: new Date(f.dueFrom) } : {}), ...(f.dueTo ? { lte: new Date(f.dueTo) } : {}) } });
  }
  return { AND: and };
}

export async function listTasks(actor: SessionUser, f: TaskFilters) {
  const where = buildTaskWhere(actor, f);
  const dir = f.dir ?? (f.sort === "priority" || f.sort === "updated" || f.sort === "created" ? "desc" : "asc");
  const orderBy: Prisma.TaskOrderByWithRelationInput[] =
    f.sort === "priority" ? [{ priority: dir }, { dueAt: { sort: "asc", nulls: "last" } }]
    : f.sort === "created" ? [{ createdAt: dir }]
    : f.sort === "updated" ? [{ updatedAt: dir }]
    : f.sort === "number" ? [{ number: dir }]
    : f.sort === "title" ? [{ title: dir }]
    : f.sort === "status" ? [{ status: dir }, { position: "asc" }]
    : [{ dueAt: { sort: dir, nulls: "last" } }, { priority: "desc" }];
  const pageSize = f.pageSize ?? 50;
  const page = f.page ?? 1;
  const [items, total] = await Promise.all([
    db.task.findMany({ where, include: taskListInclude, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    db.task.count({ where }),
  ]);
  // How much of each countable task is still to be given out.
  const counted = items.filter((t) => t.quantity !== null).map((t) => t.id);
  const split = await splitInfo(db, items);
  const withRemaining = items.map((t) => ({ ...t, ...(split.get(t.id) ?? { remaining: null, stageRemaining: null }) }));
  return { items: withRemaining, total, page, pageSize };
}

/**
 * What is still to be given out. A staged task ("30 videos": Script writing → Filming → Editing) needs every step
 * for every unit, so each step has its own count; `remaining` is then the total across steps.
 */
async function splitInfo(tx: Tx | typeof db, items: { id: string; quantity: number | null; stage: number | null; type: { stages: string[] } | null }[]) {
  const counted = items.filter((t) => t.quantity !== null).map((t) => t.id);
  const given = counted.length
    ? await tx.task.groupBy({ by: ["parentId", "stage"], where: { parentId: { in: counted }, archivedAt: null, status: { not: "CANCELLED" } }, _sum: { quantity: true } })
    : [];
  const out = new Map<string, { remaining: number | null; stageRemaining: number[] | null }>();
  for (const t of items) {
    if (t.quantity === null) continue;
    const mine = given.filter((g) => g.parentId === t.id);
    const steps = t.stage === null ? t.type?.stages ?? [] : [];
    if (steps.length) {
      const left = steps.map((_, k) => Math.max(0, t.quantity! - (mine.find((g) => g.stage === k)?._sum.quantity ?? 0)));
      out.set(t.id, { remaining: left.reduce((a, b) => a + b, 0), stageRemaining: left });
    } else {
      out.set(t.id, { remaining: Math.max(0, t.quantity - mine.reduce((a, g) => a + (g._sum.quantity ?? 0), 0)), stageRemaining: null });
    }
  }
  return out;
}

// ───────────────────────────── detail ─────────────────────────────

export async function getTaskDetail(actor: SessionUser, idOrNumber: string) {
  const asNum = /^\d+$/.test(idOrNumber) ? Number(idOrNumber) : null;
  const task = await db.task.findFirst({
    where: { AND: [asNum ? { number: asNum } : { id: idOrNumber }, taskScope(actor)] },
    include: {
      ...taskListInclude,
      creator: { select: personSelect },
      project: { select: { id: true, name: true, color: true, kind: true, accountManagerId: true, client: { select: { id: true, name: true } } } },
      children: { where: { archivedAt: null }, include: { assignee: { select: personSelect } }, orderBy: { number: "asc" } },
      dependencies: { include: { dependsOn: { select: { id: true, number: true, title: true, status: true, dueAt: true } } } },
      dependents: { include: { task: { select: { id: true, number: true, title: true, status: true } } } },
      checklist: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
      comments: { include: { author: { select: personSelect } }, orderBy: { createdAt: "asc" } },
      attachments: { include: { uploader: { select: personSelect } }, orderBy: { createdAt: "desc" } },
      submissions: {
        include: { submitter: { select: personSelect }, attachments: true, review: { include: { reviewer: { select: personSelect } } } },
        orderBy: { revision: "desc" },
      },
      activities: { include: { actor: { select: personSelect } }, orderBy: { createdAt: "desc" }, take: 100 },
      timeEntries: { include: { user: { select: personSelect } }, orderBy: { startedAt: "desc" } },
      handoffs: {
        include: { fromUser: { select: personSelect }, toUser: { select: personSelect }, byUser: { select: personSelect } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!task) throw notFound("Task");
  // Children the viewer cannot see are hidden (e.g. an employee viewing a parent they created).
  const visibleChildIds = new Set(
    (await db.task.findMany({ where: { AND: [{ parentId: task.id }, taskScope(actor)] }, select: { id: true } })).map((c) => c.id),
  );
  const children = task.children.filter((c) => visibleChildIds.has(c.id));
  const loggedMinutes = task.timeEntries.reduce((s, e) => s + e.minutes, 0);
  // Quantity split: everything given out to sub-parts that are still alive.
  const allocated = (await db.task.aggregate({ where: { parentId: task.id, archivedAt: null, status: { not: "CANCELLED" } }, _sum: { quantity: true } }))._sum.quantity ?? 0;
  const { remaining, stageRemaining } = (await splitInfo(db, [task])).get(task.id) ?? { remaining: null, stageRemaining: null };
  const runningTimer = task.timeEntries.find((e) => !e.endedAt && e.userId === actor.id) ?? null;
  const perms = {
    canManage: canManageTask(actor, task),
    canReview: canReviewTask(actor, task),
    isAssignee: task.assigneeId === actor.id,
    canComment: true,
    canDistribute: false,
  };
  perms.canDistribute = (perms.canManage || (task.assigneeId === actor.id && isManager(actor))) && !["APPROVED", "CANCELLED"].includes(task.status);
  return { ...task, children, loggedMinutes, runningTimer, perms, allocated, remaining, stageRemaining };
}
export type TaskDetail = Awaited<ReturnType<typeof getTaskDetail>>;

// ─────────────────────────── assignment rules ───────────────────────────
//   Admin            → anyone active (account managers, managers, employees)
//   Account Manager  → employees in any department, the Performance / Production managers, themselves
//   Dept manager     → people in their own department (their team), themselves
//   Employee         → nobody else
// A task always belongs to the department of the person doing it, so nobody has to pick a department.

const DOERS: readonly string[] = DOER_ROLES;

async function resolveDepartment(tx: Tx | typeof db, key: string | null | undefined) {
  if (!key) return null;
  const d = await tx.department.findUnique({ where: { key } });
  if (!d) throw invalid("Unknown department.");
  return d;
}

/** Throws unless `assigneeId` is an active user that `actor` may give work to. Returns the user. */
export async function assertAssignable(tx: Tx | typeof db, actor: SessionUser, assigneeId: string) {
  const a = await tx.user.findUnique({ where: { id: assigneeId }, include: { department: true } });
  if (!a) throw invalid("Assignee does not exist.");
  if (!a.isActive) throw invalid(`${a.name} is inactive and cannot receive new work.`);
  if (a.id === actor.id) return a;
  if (isWorkerRole(actor.role)) throw forbidden("Only managers can give work to others.");
  if (a.role === "EXTERNAL" && !canUseExternals(actor)) throw forbidden(`${a.name} takes work from the founder only.`);
  if (isAccountManager(actor)) {
    if (!DOERS.includes(a.role)) throw forbidden("Account Managers give work to their team or to the Performance / Production teams.");
    const inMyTeam = a.role !== "EMPLOYEE" || SHARED_DEPARTMENTS.includes(a.department?.key ?? "")
      || (await tx.teamMember.count({ where: { userId: a.id, team: { managerId: actor.id } } })) > 0;
    if (!inMyTeam) throw forbidden(`${a.name} is not in your team.`);
  }
  if (isDeptManager(actor) && a.department?.key !== managerDeptKey(actor)) {
    throw forbidden(`You can only give work to your ${managerDeptKey(actor)!.toLowerCase()} team.`);
  }
  return a;
}

/** Department a task should live in when `a` does it (null for admins / account managers). */
const departmentFor = (a: { role: string; departmentId: string | null }) => (DOERS.includes(a.role) ? a.departmentId : null);

/** Walk up from `newParentId`; refuse if we meet `taskId` (would create a cycle). */
async function assertNoParentCycle(tx: Tx | typeof db, taskId: string, newParentId: string) {
  let cur: string | null = newParentId;
  for (let i = 0; cur && i < 50; i++) {
    if (cur === taskId) throw invalid("A task cannot be placed under itself or one of its own subtasks.");
    const row: { parentId: string | null } | null = await tx.task.findUnique({ where: { id: cur }, select: { parentId: true } });
    cur = row?.parentId ?? null;
  }
}

async function assertNoDependencyCycle(tx: Tx | typeof db, taskId: string, dependsOnId: string) {
  // Is `taskId` reachable from `dependsOnId` by following "depends on" edges?
  const seen = new Set<string>();
  const stack = [dependsOnId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === taskId) throw invalid("That dependency would create a loop.");
    if (seen.has(cur)) continue;
    seen.add(cur);
    const next = await tx.taskDependency.findMany({ where: { taskId: cur }, select: { dependsOnId: true } });
    stack.push(...next.map((n) => n.dependsOnId));
  }
}

async function managersFor(tx: Tx | typeof db, task: { departmentId: string | null; reviewerId: string | null; creatorId: string }) {
  if (task.reviewerId) return [task.reviewerId];
  const ids = [task.creatorId];
  if (task.departmentId) {
    const dept = await tx.department.findUnique({ where: { id: task.departmentId } });
    const role = dept?.key === "PERFORMANCE" ? "PERFORMANCE_MANAGER" : dept?.key === "PRODUCTION" ? "PRODUCTION_MANAGER" : null;
    if (role) {
      const m = await tx.user.findMany({ where: { role, isActive: true, departmentId: task.departmentId }, select: { id: true } });
      ids.push(...m.map((x) => x.id));
    }
  }
  return ids;
}

const unitLabel = (type: { unit: string | null; unitPlural: string | null } | null | undefined, n: number) =>
  (n === 1 ? type?.unit : type?.unitPlural) ?? (n === 1 ? "item" : "items");

// ───────────────────────────── staged work ─────────────────────────────
// Every unit goes through the type's steps in order. By any day, a step can never have more units due than the
// step before it had due on earlier days (5 filmed on the 20th needs 5 scripts due by the 19th).

const dayKey = (d: Date) => { const p = zonedParts(d); return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`; };
const dayLabel = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** The main task a step belongs to: the nearest ancestor that is not itself a step. */
async function stagedRoot(tx: Tx, id: string) {
  const sel = { id: true, parentId: true, stage: true } as const;
  let cur = await tx.task.findUnique({ where: { id }, select: sel });
  for (let i = 0; cur && cur.stage !== null && cur.parentId && i < 10; i++) cur = await tx.task.findUnique({ where: { id: cur.parentId }, select: sel });
  return cur?.id ?? id;
}

/** Refuses any plan where a step is due before enough of the previous step. Runs after the change, inside the transaction. */
async function assertStageOrder(tx: Tx, rootId: string) {
  const root = await tx.task.findUnique({ where: { id: rootId }, select: { type: { select: { stages: true, unit: true, unitPlural: true } } } });
  const type = root?.type;
  const stages = type?.stages ?? [];
  if (stages.length < 2) return;
  const parts: { id: string; parentId: string | null; stage: number | null; quantity: number | null; dueAt: Date | null }[] = [];
  let frontier = [rootId];
  for (let depth = 0; frontier.length && depth < 6; depth++) {
    const kids = await tx.task.findMany({
      where: { parentId: { in: frontier }, archivedAt: null, status: { not: "CANCELLED" } },
      select: { id: true, parentId: true, stage: true, quantity: true, dueAt: true },
    });
    parts.push(...kids);
    frontier = kids.map((k) => k.id);
  }
  // A part that was split again only counts for what it kept; its pieces count on their own days.
  const passedOn = new Map<string, number>();
  for (const p of parts) if (p.parentId && p.parentId !== rootId) passedOn.set(p.parentId, (passedOn.get(p.parentId) ?? 0) + (p.quantity ?? 0));
  const byStage = stages.map(() => [] as { day: string; qty: number }[]);
  for (const p of parts) {
    if (p.stage === null || !p.dueAt) continue;
    const own = (p.quantity ?? 0) - (passedOn.get(p.id) ?? 0);
    if (own > 0) byStage[p.stage]?.push({ day: dayKey(p.dueAt), qty: own });
  }
  const sum = (xs: { qty: number }[]) => xs.reduce((s, x) => s + x.qty, 0);
  for (let k = 1; k < stages.length; k++) {
    for (const day of [...new Set(byStage[k]!.map((x) => x.day))].sort()) {
      const need = sum(byStage[k]!.filter((x) => x.day <= day));
      const ready = sum(byStage[k - 1]!.filter((x) => x.day <= day)); // the step before may be due the same day
      if (need > ready) {
        const prev = stages[k - 1]!.toLowerCase();
        throw invalid(`${stages[k]} for ${need} ${unitLabel(type, need)} is planned by ${dayLabel(day)}, but only ${ready} ${ready === 1 ? "has" : "have"} ${prev} due by then. Give out more ${prev} first, or pick a later day.`);
      }
    }
  }
}

// ───────────────────────────── create ─────────────────────────────

const dateish = z.union([z.string().datetime({ offset: true }), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).nullable().optional();
const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : new Date(v));

export const createTaskSchema = z.object({
  title: z.string().trim().max(200).optional().nullable(),
  typeId: z.string().optional().nullable(),
  quantity: z.number().int().min(1, "Quantity must be at least 1").max(100_000).optional().nullable(),
  description: z.string().max(20_000).optional().nullable(),
  projectId: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  reviewerId: z.string().optional().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  status: z.enum(["BACKLOG", "READY"]).optional(),
  startDate: dateish,
  dueAt: dateish,
  estimateMinutes: z.number().int().min(0).max(100_000).optional().nullable(),
  labels: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(12).optional(),
  checklist: z.array(z.string().trim().min(1).max(300)).max(50).optional(),
  dependsOn: z.array(z.string()).max(20).optional(),
});

/** Creates exactly one task — nothing is ever added automatically. */
export async function createTask(actor: SessionUser, raw: unknown) {
  const input = createTaskSchema.parse(raw);
  if (!isManager(actor) && input.assigneeId && input.assigneeId !== actor.id) throw forbidden("Employees cannot assign work to others.");

  return db.$transaction(async (tx) => {
    let parent: Awaited<ReturnType<typeof loadForActor>> | null = null;
    if (input.parentId) {
      parent = await loadForActor(tx, actor, input.parentId);
      if (!canManageTask(actor, parent) && parent.assigneeId !== actor.id) throw forbidden("You cannot add subtasks to that task.");
    }
    if (!isManager(actor) && !parent) throw forbidden("Employees can only create subtasks of their own tasks.");
    const projectId = input.projectId ?? parent?.projectId ?? null;
    // Private work stays private: a task inherits its project's (or parent's) owner.
    let privateOwnerId = parent?.privateOwnerId ?? null;
    if (projectId) {
      const project = await tx.project.findFirst({ where: { AND: [{ id: projectId }, parent ? {} : privateProjectGuard(actor)] } });
      if (!project) throw invalid("Project does not exist.");
      if (parent && (project.privateOwnerId ?? null) !== (parent.privateOwnerId ?? null)) throw invalid("A subtask must stay in the same client as its task.");
      privateOwnerId = project.privateOwnerId ?? privateOwnerId;
      if (isAccountManager(actor) && project.accountManagerId !== actor.id && !parent) throw forbidden("You can only create work in projects you manage.");
    }

    const type = input.typeId ? await tx.taskType.findUnique({ where: { id: input.typeId } }) : null;
    if (input.typeId && (!type || !type.isActive)) throw invalid("Unknown task type.");
    const quantity = type?.unit ? input.quantity ?? null : null;
    if (type?.unit && !quantity) throw invalid(`How many ${type.unitPlural ?? "items"}? Enter a number.`);
    const title = input.title?.trim() || (type ? (quantity ? `${quantity} ${unitLabel(type, quantity)}` : type.name) : "");
    if (title.length < 2) throw invalid("Give the task a title or pick a task type.");

    const assigneeId = input.assigneeId ?? (isManager(actor) ? null : actor.id);
    const assignee = assigneeId ? await assertAssignable(tx, actor, assigneeId) : null;

    let departmentId = assignee ? departmentFor(assignee) : null;
    if (!departmentId) {
      const key = input.department ?? parent?.department?.key ?? (isDeptManager(actor) ? managerDeptKey(actor) : null);
      if (input.department && !canUseDepartment(actor, input.department)) throw forbidden("You cannot create tasks for that department.");
      departmentId = (await resolveDepartment(tx, key))?.id ?? null;
    }
    if (isDeptManager(actor)) {
      const own = await tx.department.findUnique({ where: { key: managerDeptKey(actor)! } });
      if (departmentId !== own?.id) throw forbidden("Tasks you create must stay in your department.");
    }

    let reviewerId = input.reviewerId ?? null;
    if (reviewerId) {
      const r = await tx.user.findUnique({ where: { id: reviewerId } });
      if (!r?.isActive || isWorkerRole(r.role)) throw invalid("Reviewer must be an active manager.");
    } else if (isManager(actor) && assigneeId !== actor.id) {
      reviewerId = actor.id;
    } else if (parent?.reviewerId) {
      reviewerId = parent.reviewerId;
    }

    const dueAt = toDate(input.dueAt) ?? null;
    const startDate = toDate(input.startDate) ?? null;
    if (dueAt && startDate && dueAt < startDate) throw invalid("Deadline cannot be before the start date.");

    const task = await tx.task.create({
      data: {
        title, description: input.description ?? type?.description ?? null, typeId: type?.id ?? null, quantity,
        projectId, parentId: parent?.id ?? null, departmentId, creatorId: actor.id, assigneeId, reviewerId, privateOwnerId,
        priority: input.priority ?? "MEDIUM", status: input.status ?? (assigneeId ? "READY" : "BACKLOG"),
        startDate, dueAt, estimateMinutes: input.estimateMinutes ?? null, labels: [...new Set(input.labels ?? [])],
        checklist: { create: (input.checklist ?? []).map((text, position) => ({ text, position })) },
      },
    });

    for (const depId of input.dependsOn ?? []) {
      await loadForActor(tx, actor, depId);
      await tx.taskDependency.create({ data: { taskId: task.id, dependsOnId: depId } });
    }

    await activity(tx, actor.id, "task.created", { taskId: task.id, projectId: projectId ?? undefined }, { title: task.title, quantity });
    if (assigneeId) {
      await tx.handoff.create({ data: { taskId: task.id, toUserId: assigneeId, byUserId: actor.id, note: "Initial assignment" } });
      await notify(tx, [assigneeId], {
        type: "task.assigned", title: `New task: ${task.title}`, body: `${actor.name} assigned ${taskRef(task.number)} to you.`,
        taskId: task.id, link: link(task.number),
      }, actor.id);
    }
    await audit(actor, "task.create", "Task", task.id, { after: { title: task.title, assigneeId, projectId, quantity }, tx });
    return task;
  });
}

// ───────────────────────────── distribute ─────────────────────────────

export const distributeSchema = z.object({
  allocations: z.array(z.object({
    assigneeId: z.string(),
    quantity: z.number().int().min(1).max(100_000).optional().nullable(),
    /** Which step of a staged task this part is (index into type.stages). */
    stage: z.number().int().min(0).max(20).optional().nullable(),
    dueAt: dateish,
    /** Splitting your own work: the day you plan to finish this part. */
    plannedAt: dateish,
    note: z.string().max(2000).optional().nullable(),
  })).min(1, "Choose at least one person").max(30),
});

/**
 * Split a task between people. Each allocation becomes a subtask owned by that person
 * (e.g. 8 of the 60 videos). The total can never exceed what is left, even with two managers at once.
 */
export async function distributeTask(actor: SessionUser, id: string, raw: unknown) {
  const input = distributeSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const perm = await loadForActor(tx, actor, id);
    await tx.$queryRaw`SELECT id FROM "Task" WHERE id = ${perm.id} FOR UPDATE`;
    const task = await tx.task.findUniqueOrThrow({
      where: { id: perm.id },
      include: { type: true, project: { select: { name: true, client: { select: { name: true } } } }, children: { where: { archivedAt: null, status: { not: "CANCELLED" } }, select: { quantity: true, stage: true } } },
    });
    // Anyone may split their own counted work into parts for themselves (e.g. an external doing 10 videos on two days).
    const selfSplit = task.assigneeId === actor.id && input.allocations.every((a) => a.assigneeId === actor.id);
    const responsible = (task.assigneeId === actor.id && isManager(actor)) || selfSplit;
    if (!responsible && !canManageTask(actor, perm)) throw forbidden("Only the person responsible for this task can split it.");
    if (selfSplit && task.quantity === null) throw invalid("Only a task with a number (e.g. 10 videos) can be split into parts.");
    if (CLOSED_STATUSES.includes(task.status as StatusKey)) throw invalid("This task is already closed.");

    const counted = task.quantity !== null;
    // A main staged task is split per step; a step that was given to a manager is split again within that step.
    const stages = task.stage === null ? task.type?.stages ?? [] : [];
    const staged = counted && stages.length > 0;
    const isStep = task.stage !== null;
    const rootId = isStep ? await stagedRoot(tx, task.id) : task.id;
    if (rootId !== task.id) await tx.$queryRaw`SELECT id FROM "Task" WHERE id = ${rootId} FOR UPDATE`;
    if (staged && input.allocations.some((a) => a.stage === null || a.stage === undefined || a.stage >= stages.length)) {
      throw invalid(`Choose the step: ${stages.join(", ")}.`);
    }
    const given = (k: number | null) => task.children.filter((c) => !staged || c.stage === k).reduce((s, c) => s + (c.quantity ?? 0), 0);
    if (counted) {
      if (input.allocations.some((a) => !a.quantity)) throw invalid(`Enter how many ${unitLabel(task.type, 2)} each person gets.`);
      for (const k of staged ? stages.map((_, i) => i) : [null]) {
        const wanted = input.allocations.filter((a) => !staged || a.stage === k).reduce((s, a) => s + a.quantity!, 0);
        if (!wanted) continue;
        const left = task.quantity! - given(k);
        const step = staged ? ` for ${stages[k!]!.toLowerCase()}` : "";
        if (wanted > left) {
          throw invalid(left ? `Only ${left} ${unitLabel(task.type, left)} left to give out${step} (you entered ${wanted}).` : `Everything in this task has already been given out${step}.`);
        }
      }
    }

    // "8 videos · Nile Bites" reads better than "8 videos · 60 videos" when the main task kept its automatic title.
    const autoTitle = counted && task.title === `${task.quantity} ${unitLabel(task.type, task.quantity!)}`;
    const base = isStep ? task.title.replace(/^\d+\s+[^·]+·\s*/, "") : autoTitle ? task.project?.client.name ?? task.type?.name ?? task.title : task.title;
    const created: (TaskRow & { assigneeName: string })[] = [];
    for (const al of input.allocations) {
      const a = await assertAssignable(tx, actor, al.assigneeId);
      const qty = counted ? al.quantity! : null;
      const stage = staged ? al.stage! : isStep ? task.stage : null;
      const dueAt = toDate(al.dueAt) ?? task.dueAt;
      if (task.dueAt && dueAt && dueAt > task.dueAt) throw invalid("A part cannot be due after the main task's deadline.");
      if (stage !== null && !dueAt) throw invalid("Pick a day for this step.");
      const stepName = staged ? stages[stage!]! : null;
      const what = qty ? `${qty} ${unitLabel(task.type, qty)}${stepName ? ` (${stepName.toLowerCase()})` : ""}` : "a task";
      const child = await tx.task.create({
        data: {
          title: (qty ? [`${qty} ${unitLabel(task.type, qty)}`, stepName, base].filter(Boolean).join(" · ") : task.title).slice(0, 200),
          description: al.note || task.description, typeId: task.typeId, quantity: qty, stage,
          projectId: task.projectId, parentId: task.id, departmentId: departmentFor(a) ?? task.departmentId,
          creatorId: actor.id, assigneeId: a.id, reviewerId: a.id === actor.id ? task.reviewerId : actor.id, privateOwnerId: task.privateOwnerId,
          priority: task.priority, status: "READY", dueAt, labels: task.labels, plannedAt: toDate(al.plannedAt) ?? null,
        },
      });
      await tx.handoff.create({ data: { taskId: child.id, toUserId: a.id, byUserId: actor.id, note: al.note || `Part of ${taskRef(task.number)}` } });
      await activity(tx, actor.id, "task.created", { taskId: child.id, projectId: task.projectId ?? undefined }, { title: child.title, quantity: qty, stage: stepName, from: task.number });
      await notify(tx, [a.id], {
        type: "task.assigned", title: `New task: ${child.title}`,
        body: `${actor.name} gave you ${what} from ${taskRef(task.number)}.`,
        taskId: child.id, link: link(child.number),
      }, actor.id);
      created.push({ ...child, assigneeName: a.name });
    }
    if (staged || isStep) await assertStageOrder(tx, rootId);
    // Planned parts: the people who gave the work out see the days.
    const planned = created.filter((c) => c.plannedAt);
    if (selfSplit && planned.length) {
      const when = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: process.env.APP_TIMEZONE ?? "Africa/Cairo" });
      await notify(tx, [task.creatorId, task.reviewerId], {
        type: "task.planned", title: `${actor.name} planned ${taskRef(task.number)}: ${planned.map((c) => `${c.quantity} on ${when(c.plannedAt!)}`).join(", ")}`,
        body: task.title, taskId: task.id, link: link(task.number),
      }, actor.id);
    }

    await activity(tx, actor.id, "task.distributed", { taskId: task.id }, { parts: created.map((c) => ({ to: c.assigneeName, quantity: c.quantity, stage: c.stage })) });
    await tx.task.update({
      where: { id: task.id },
      data: { version: { increment: 1 }, ...(["BACKLOG", "READY", "SCHEDULED"].includes(task.status) ? { status: "IN_PROGRESS" } : {}) },
    });
    const left = (k: number | null) => task.quantity! - given(k) - created.filter((c) => !staged || c.stage === k).reduce((s, c) => s + (c.quantity ?? 0), 0);
    const stageRemaining = staged ? stages.map((_, k) => left(k)) : null;
    const remaining = !counted ? null : staged ? stageRemaining![input.allocations[0]!.stage!]! : left(null);
    return { created, remaining, stageRemaining };
  });
}


// ───────────────────────────── update ─────────────────────────────

export const updateTaskSchema = z.object({
  version: z.number().int().optional(),
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().max(20_000).nullable().optional(),
  projectId: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  reviewerId: z.string().nullable().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  startDate: dateish,
  dueAt: dateish,
  estimateMinutes: z.number().int().min(0).max(100_000).nullable().optional(),
  quantity: z.number().int().min(1).max(100_000).optional(),
  labels: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(12).optional(),
  /** Reassignment: a note explaining the hand-off. */
  handoffNote: z.string().max(2000).optional(),
  /** If the new assignee is busy during the current slot: "unschedule" keeps the deadline but frees the slot. */
  onConflict: z.enum(["reject", "unschedule"]).optional(),
});

export async function updateTask(actor: SessionUser, id: string, raw: unknown) {
  const input = updateTaskSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const task = await loadForActor(tx, actor, id);
    if (!canManageTask(actor, task)) throw forbidden("Only the responsible manager can edit this task.");

    const data: Prisma.TaskUncheckedUpdateManyInput = {};
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const set = <K extends keyof typeof task>(key: K, value: (typeof task)[K] | undefined) => {
      if (value === undefined) return;
      const before = task[key];
      const same = before instanceof Date && value instanceof Date ? before.getTime() === value.getTime() : JSON.stringify(before) === JSON.stringify(value);
      if (same) return;
      (data as Record<string, unknown>)[key as string] = value;
      changes[key as string] = { from: before, to: value };
    };

    set("title", input.title);
    set("description", input.description);
    set("priority", input.priority);
    set("estimateMinutes", input.estimateMinutes);
    if (input.quantity !== undefined && task.quantity !== null && input.quantity !== task.quantity) {
      const given = (await tx.task.aggregate({ where: { parentId: task.id, archivedAt: null, status: { not: "CANCELLED" } }, _sum: { quantity: true } }))._sum.quantity ?? 0;
      if (input.quantity < given) throw invalid(`${given} are already given out — the total cannot be lower than that.`);
      if (task.parentId) {
        const parent = await tx.task.findUnique({ where: { id: task.parentId }, select: { quantity: true } });
        if (parent?.quantity) {
          const siblings = (await tx.task.aggregate({ where: { parentId: task.parentId, id: { not: task.id }, stage: task.stage, archivedAt: null, status: { not: "CANCELLED" } }, _sum: { quantity: true } }))._sum.quantity ?? 0;
          if (siblings + input.quantity > parent.quantity) throw invalid(`Only ${parent.quantity - siblings} can go to this part.`);
        }
      }
      set("quantity", input.quantity);
    }
    if (input.labels) set("labels", [...new Set(input.labels)]);
    set("startDate", toDate(input.startDate));
    set("dueAt", toDate(input.dueAt));

    let deptKey = task.department?.key ?? null;
    if (input.department !== undefined && input.department !== deptKey) {
      if (!canUseDepartment(actor, input.department)) throw forbidden("You cannot move tasks into that department.");
      const d = await resolveDepartment(tx, input.department);
      deptKey = d?.key ?? null;
      set("departmentId", d?.id ?? null);
    }
    if (input.projectId !== undefined && input.projectId !== task.projectId) {
      if (input.projectId) {
        const p = await tx.project.findFirst({ where: { AND: [{ id: input.projectId }, privateProjectGuard(actor)] } });
        if (!p) throw invalid("Project does not exist.");
        if ((p.privateOwnerId ?? null) !== (task.privateOwnerId ?? null)) throw invalid("Private work and LOG work can't be mixed: this task can't move to that project.");
        if (isAccountManager(actor) && p.accountManagerId !== actor.id) throw forbidden("You can only move work into projects you manage.");
      }
      set("projectId", input.projectId);
    }
    if (input.parentId !== undefined && input.parentId !== task.parentId) {
      if (input.parentId) {
        const p = await loadForActor(tx, actor, input.parentId);
        if (!canManageTask(actor, p)) throw forbidden("You cannot move work under that task.");
        if ((p.privateOwnerId ?? null) !== (task.privateOwnerId ?? null)) throw invalid("Private work and LOG work can't be mixed: this task can't move under that task.");
        await assertNoParentCycle(tx, task.id, input.parentId);
      }
      set("parentId", input.parentId);
    }
    if (input.reviewerId !== undefined && input.reviewerId !== task.reviewerId) {
      if (input.reviewerId) {
        const r = await tx.user.findUnique({ where: { id: input.reviewerId } });
        if (!r?.isActive || isWorkerRole(r.role)) throw invalid("Reviewer must be an active manager.");
        if (r.id === (input.assigneeId ?? task.assigneeId)) throw invalid("The assignee cannot review their own work.");
      }
      set("reviewerId", input.reviewerId);
    }

    const effStart = (data.startDate as Date | null | undefined) ?? task.startDate;
    const effDue = (data.dueAt as Date | null | undefined) === undefined ? task.dueAt : (data.dueAt as Date | null);
    if (effStart && effDue && effDue < effStart) throw invalid("Deadline cannot be before the start date.");

    // Reassignment — the single place where ownership moves, so it can never contradict itself.
    let reassignedTo: string | null | undefined;
    let freedSlot = false;
    if (input.assigneeId !== undefined && input.assigneeId !== task.assigneeId) {
      if (input.assigneeId) {
        const next = await assertAssignable(tx, actor, input.assigneeId);
        const nextDept = departmentFor(next);
        if (nextDept && nextDept !== task.departmentId) set("departmentId", nextDept); // work moves with the person
        if (task.scheduledStart && task.scheduledEnd && !CLOSED_STATUSES.includes(task.status as StatusKey)) {
          await lockPerson(tx, input.assigneeId);
          const avail = await checkAvailability(tx, input.assigneeId, task.scheduledStart, task.scheduledEnd, { excludeTaskId: task.id });
          if (!avail.ok) {
            if (input.onConflict === "unschedule") {
              set("scheduledStart", null);
              set("scheduledEnd", null);
              if (task.status === "SCHEDULED") set("status", "READY");
              freedSlot = true;
            } else {
              throw new AppError("UNAVAILABLE", avail.message!, { conflicts: avail.conflicts, suggestions: avail.suggestions, canUnschedule: true });
            }
          }
        }
        if (task.status === "BACKLOG") set("status", "READY");
      }
      set("assigneeId", input.assigneeId);
      reassignedTo = input.assigneeId;
      // Running timers belong to the previous owner — stop them so effort is not double-counted.
      if (task.assigneeId) await stopTimers(tx, task.assigneeId, task.id);
    }

    if (!Object.keys(changes).length) return { task, changed: false };
    await bump(tx, task.id, input.version, data);
    if (task.stage !== null && (changes.dueAt || changes.quantity)) {
      const rootId = await stagedRoot(tx, task.id);
      await tx.$queryRaw`SELECT id FROM "Task" WHERE id = ${rootId} FOR UPDATE`;
      await assertStageOrder(tx, rootId);
    }

    if (reassignedTo !== undefined) {
      await tx.handoff.create({ data: { taskId: task.id, fromUserId: task.assigneeId, toUserId: reassignedTo ?? actor.id, byUserId: actor.id, note: input.handoffNote || null } });
      await activity(tx, actor.id, "task.reassigned", { taskId: task.id }, { from: task.assigneeId, to: reassignedTo, note: input.handoffNote, freedSlot });
      if (reassignedTo) {
        await notify(tx, [reassignedTo], {
          type: "task.assigned", title: `Handed to you: ${data.title ?? task.title}`,
          body: `${actor.name} assigned ${taskRef(task.number)} to you${input.handoffNote ? ` — “${input.handoffNote}”` : "."}`,
          taskId: task.id, link: link(task.number),
        }, actor.id);
      }
      await notify(tx, [task.assigneeId], {
        type: "task.reassigned", title: `Reassigned: ${task.title}`, body: `${actor.name} moved ${taskRef(task.number)} to someone else.`,
        taskId: task.id, link: link(task.number),
      }, actor.id);
      await audit(actor, "task.reassign", "Task", task.id, { before: { assigneeId: task.assigneeId }, after: { assigneeId: reassignedTo }, tx });
    }
    if (changes.dueAt) {
      await activity(tx, actor.id, "task.due_changed", { taskId: task.id }, { from: changes.dueAt.from, to: changes.dueAt.to });
      await notify(tx, [(reassignedTo ?? task.assigneeId)], {
        type: "task.deadline", title: `Deadline changed: ${task.title}`,
        body: changes.dueAt.to ? `New deadline ${(changes.dueAt.to as Date).toISOString()}` : "Deadline removed",
        taskId: task.id, link: link(task.number),
      }, actor.id);
      await audit(actor, "task.deadline", "Task", task.id, { before: { dueAt: changes.dueAt.from }, after: { dueAt: changes.dueAt.to }, tx });
    }
    const other = Object.keys(changes).filter((k) => !["assigneeId", "dueAt", "status", "scheduledStart", "scheduledEnd"].includes(k));
    if (other.length) await activity(tx, actor.id, "task.updated", { taskId: task.id }, { fields: other });
    if (changes.priority && (changes.priority.to === "URGENT")) {
      await notify(tx, [reassignedTo ?? task.assigneeId], {
        type: "task.priority", title: `Now urgent: ${task.title}`, taskId: task.id, link: link(task.number),
      }, actor.id);
    }
    return { task: await tx.task.findUniqueOrThrow({ where: { id: task.id }, include: taskListInclude }), changed: true, freedSlot };
  });
}

// ───────────────────────────── status ─────────────────────────────

export const statusSchema = z.object({
  status: z.enum(["BACKLOG", "READY", "SCHEDULED", "IN_PROGRESS", "SUBMITTED", "CHANGES_REQUESTED", "APPROVED", "BLOCKED", "ON_HOLD", "CANCELLED"]),
  version: z.number().int().optional(),
  reason: z.string().max(2000).optional(),
});

export async function changeStatus(actor: SessionUser, id: string, raw: unknown) {
  const input = statusSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const task = await loadForActor(tx, actor, id);
    const perms = { canManage: canManageTask(actor, task), isAssignee: task.assigneeId === actor.id };
    const from = task.status as StatusKey;
    const to = input.status as StatusKey;
    if (to === "SUBMITTED") throw invalid("Use “Submit for review” so your notes and deliverables are recorded.");
    if (to === "APPROVED" || to === "CHANGES_REQUESTED") throw invalid("Use the review panel to approve or request changes.");
    if (!canTransition(from, to, perms)) {
      throw new AppError(perms.canManage || perms.isAssignee ? "INVALID" : "FORBIDDEN", `Cannot move from ${statusLabel(from)} to ${statusLabel(to)}.`);
    }
    if (to === "IN_PROGRESS") {
      const waiting = await tx.taskDependency.findMany({
        where: { taskId: task.id, dependsOn: { status: { notIn: ["APPROVED", "CANCELLED"] } } },
        include: { dependsOn: { select: { number: true, status: true } } },
      });
      if (waiting.length) {
        throw invalid(`Waiting on ${waiting.map((w) => `${taskRef(w.dependsOn.number)} (${statusLabel(w.dependsOn.status)})`).join(", ")}. Finish dependencies first or mark this task Blocked.`);
      }
    }
    if (to === "SCHEDULED" && !task.scheduledStart) throw invalid("Pick a time slot on the calendar to schedule this task.");
    if ((to === "BLOCKED" || to === "ON_HOLD" || to === "CANCELLED") && !input.reason?.trim() && to !== "ON_HOLD") {
      throw invalid(`Please give a reason for marking this task ${statusLabel(to).toLowerCase()}.`);
    }
    if (to === "CANCELLED" && !perms.canManage) throw forbidden();

    await bump(tx, task.id, input.version, {
      status: to,
      completedAt: null,
      ...(to === "CANCELLED" ? { scheduledStart: null, scheduledEnd: null } : {}),
    });
    if (task.assigneeId && (to === "BLOCKED" || to === "ON_HOLD" || to === "CANCELLED")) await stopTimers(tx, task.assigneeId, task.id);
    await activity(tx, actor.id, "task.status", { taskId: task.id }, { from, to, reason: input.reason });
    if (input.reason) await tx.comment.create({ data: { taskId: task.id, authorId: actor.id, body: `**${statusLabel(to)}:** ${input.reason}` } });

    const audience = perms.isAssignee ? await managersFor(tx, task) : [task.assigneeId];
    await notify(tx, audience, {
      type: to === "BLOCKED" ? "task.blocked" : "task.status",
      title: `${taskRef(task.number)} → ${statusLabel(to)}`, body: `${actor.name}: ${task.title}${input.reason ? ` — ${input.reason}` : ""}`,
      taskId: task.id, link: link(task.number),
    }, actor.id);
    if (to === "CANCELLED") await audit(actor, "task.cancel", "Task", task.id, { before: { status: from }, after: { status: to, reason: input.reason }, tx });
    return tx.task.findUniqueOrThrow({ where: { id: task.id }, include: taskListInclude });
  });
}

// ─────────────────────────── submit & review ───────────────────────────

export const submitSchema = z.object({
  notes: z.string().trim().min(3, "Describe what you delivered").max(20_000),
  links: z.array(z.string().trim().url("Each link must be a full URL (https://…)").max(2000)).max(20).optional(),
  attachmentIds: z.array(z.string()).max(20).optional(),
  version: z.number().int().optional(),
});

export async function submitWork(actor: SessionUser, id: string, raw: unknown) {
  const input = submitSchema.parse(raw);
  for (const l of input.links ?? []) if (!/^https?:\/\//i.test(l)) throw invalid("Links must start with http:// or https://");
  return db.$transaction(async (tx) => {
    const task = await loadForActor(tx, actor, id);
    if (task.assigneeId !== actor.id) throw forbidden("Only the assignee can submit this task.");
    if (!canSubmit(task.status as StatusKey)) throw invalid(`A task that is ${statusLabel(task.status)} cannot be submitted. Move it to In Progress first.`);
    const openChecklist = await tx.checklistItem.count({ where: { taskId: task.id, done: false } });

    // Status guard in the WHERE clause makes double-clicks harmless: the 2nd request matches nothing.
    const res = await tx.task.updateMany({
      where: { id: task.id, status: { in: ["IN_PROGRESS", "CHANGES_REQUESTED"] }, ...(input.version !== undefined ? { version: input.version } : {}) },
      data: { status: "SUBMITTED", version: { increment: 1 } },
    });
    if (!res.count) throw new AppError("CONFLICT", "This task was already submitted or changed. Refresh to see the latest state.");

    const revision = (await tx.submission.count({ where: { taskId: task.id } })) + 1;
    const sub = await tx.submission.create({
      data: { taskId: task.id, submitterId: actor.id, revision, notes: input.notes, links: input.links ?? [] },
    });
    if (input.attachmentIds?.length) {
      await tx.attachment.updateMany({
        where: { id: { in: input.attachmentIds }, taskId: task.id, uploaderId: actor.id, submissionId: null },
        data: { submissionId: sub.id },
      });
    }
    await stopTimers(tx, actor.id, task.id);
    await activity(tx, actor.id, revision > 1 ? "task.resubmitted" : "task.submitted", { taskId: task.id }, { revision, openChecklist });
    await notify(tx, await managersFor(tx, task), {
      type: revision > 1 ? "task.resubmitted" : "task.submitted",
      title: `${revision > 1 ? "Resubmitted" : "Ready for review"}: ${task.title}`,
      body: `${actor.name} submitted revision ${revision} of ${taskRef(task.number)}.`,
      taskId: task.id, link: link(task.number),
    }, actor.id);
    return { submission: sub, openChecklist };
  });
}

export const reviewSchema = z.object({
  decision: z.enum(["APPROVED", "CHANGES_REQUESTED"]),
  feedback: z.string().trim().max(20_000).optional(),
  version: z.number().int().optional(),
});

export async function reviewTask(actor: SessionUser, id: string, raw: unknown) {
  const input = reviewSchema.parse(raw);
  if (input.decision === "CHANGES_REQUESTED" && (!input.feedback || input.feedback.length < 5)) {
    throw invalid("Explain what needs to change (at least a short sentence) so the assignee can fix it.");
  }
  return db.$transaction(async (tx) => {
    const task = await loadForActor(tx, actor, id);
    if (!canReviewTask(actor, task)) {
      throw forbidden(task.assigneeId === actor.id ? "You cannot review your own work." : "You are not a reviewer for this task.");
    }
    if (!canBeReviewed(task.status as StatusKey)) throw invalid("Only submitted work can be reviewed.");
    const latest = await tx.submission.findFirst({ where: { taskId: task.id }, orderBy: { revision: "desc" }, include: { review: true } });
    if (!latest || latest.review) throw new AppError("CONFLICT", "There is no pending submission to review.");

    if (input.decision === "APPROVED") {
      const openChildren = await tx.task.count({ where: { parentId: task.id, archivedAt: null, status: { notIn: ["APPROVED", "CANCELLED"] } } });
      if (openChildren) throw invalid(`${openChildren} subtask${openChildren > 1 ? "s are" : " is"} still open. Approve or cancel them before approving the parent task.`);
    }
    const res = await tx.task.updateMany({
      where: { id: task.id, status: "SUBMITTED", ...(input.version !== undefined ? { version: input.version } : {}) },
      data: {
        status: input.decision, version: { increment: 1 },
        completedAt: input.decision === "APPROVED" ? new Date() : null,
      },
    });
    if (!res.count) throw new AppError("CONFLICT", "This task was already reviewed or changed. Refresh to see the latest state.");
    const review = await tx.review.create({
      data: { submissionId: latest.id, reviewerId: actor.id, decision: input.decision, feedback: input.feedback || null },
    });
    await activity(tx, actor.id, input.decision === "APPROVED" ? "task.approved" : "task.changes_requested", { taskId: task.id }, {
      revision: latest.revision, feedback: input.feedback,
    });
    await notify(tx, [task.assigneeId], {
      type: input.decision === "APPROVED" ? "task.approved" : "task.changes_requested",
      title: input.decision === "APPROVED" ? `Approved: ${task.title}` : `Changes requested: ${task.title}`,
      body: input.feedback ? `${actor.name}: ${input.feedback.slice(0, 240)}` : `${actor.name} approved revision ${latest.revision}.`,
      taskId: task.id, link: link(task.number),
    }, actor.id);
    // When the last part of a split task is approved, tell the owner of the main task it can be submitted.
    if (input.decision === "APPROVED" && task.parentId) {
      const stillOpen = await tx.task.count({ where: { parentId: task.parentId, archivedAt: null, status: { notIn: ["APPROVED", "CANCELLED"] } } });
      if (!stillOpen) {
        const p = await tx.task.findUnique({ where: { id: task.parentId }, select: { id: true, number: true, title: true, assigneeId: true, quantity: true, stage: true, type: { select: { stages: true } } } });
        const left = p ? (await splitInfo(tx, [p])).get(p.id)?.remaining ?? 0 : 0;
        if (p && !left) await notify(tx, [p.assigneeId], {
          type: "task.parts_done", title: "All parts approved: " + p.title, body: "Every part is done — review it and submit the main task.",
          taskId: p.id, link: link(p.number),
        }); // also when the owner approved the last part themselves: it is their cue to submit
      }
    }
    await audit(actor, `task.review.${input.decision.toLowerCase()}`, "Task", task.id, { after: { revision: latest.revision }, tx });
    return review;
  });
}

// ───────────────────────────── scheduling ─────────────────────────────

export const scheduleSchema = z.object({
  start: z.string().datetime({ offset: true }).nullable(),
  end: z.string().datetime({ offset: true }).nullable(),
  /** Optional: move the block to another person at the same time (team view drag). */
  assigneeId: z.string().optional(),
  version: z.number().int().optional(),
  dryRun: z.boolean().optional(),
});

export async function scheduleTask(actor: SessionUser, id: string, raw: unknown) {
  const input = scheduleSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const task = await loadForActor(tx, actor, id);
    const canManage = canManageTask(actor, task);
    const isAssignee = task.assigneeId === actor.id;
    if (!canManage && !isAssignee) throw forbidden("You cannot schedule this task.");
    if (input.assigneeId && input.assigneeId !== task.assigneeId && !canManage) throw forbidden("Only a manager can move work to another person.");
    if (CLOSED_STATUSES.includes(task.status as StatusKey)) throw invalid(`A ${statusLabel(task.status).toLowerCase()} task cannot be scheduled.`);

    if (!input.start || !input.end) {
      if (input.dryRun) return { ok: true };
      await bump(tx, task.id, input.version, { scheduledStart: null, scheduledEnd: null, ...(task.status === "SCHEDULED" ? { status: "READY" } : {}) });
      await activity(tx, actor.id, "task.unscheduled", { taskId: task.id });
      return { ok: true, task: await tx.task.findUniqueOrThrow({ where: { id: task.id }, include: taskListInclude }) };
    }
    const start = new Date(input.start);
    const end = new Date(input.end);
    const who = input.assigneeId ?? task.assigneeId;
    if (!who) throw invalid("Assign the task to someone before scheduling it.");
    const whoUser = who !== task.assigneeId ? await assertAssignable(tx, actor, who) : null;

    await lockPerson(tx, who);
    const avail = await checkAvailability(tx, who, start, end, { excludeTaskId: task.id, taskId: task.id });
    if (!avail.ok) throw new AppError("UNAVAILABLE", avail.message!, { conflicts: avail.conflicts, suggestions: avail.suggestions });
    if (input.dryRun) return { ok: true };

    const nextStatus = ["BACKLOG", "READY", "BLOCKED"].includes(task.status) && task.status !== "BLOCKED" ? "SCHEDULED" : task.status;
    await bump(tx, task.id, input.version, {
      scheduledStart: start, scheduledEnd: end, status: nextStatus, ...(whoUser ? { assigneeId: who, departmentId: departmentFor(whoUser) ?? task.departmentId } : {}),
    });
    await activity(tx, actor.id, "task.scheduled", { taskId: task.id }, {
      start, end, from: task.scheduledStart, assignee: who !== task.assigneeId ? { from: task.assigneeId, to: who } : undefined,
    });
    if (who !== task.assigneeId) {
      if (task.assigneeId) await stopTimers(tx, task.assigneeId, task.id);
      await tx.handoff.create({ data: { taskId: task.id, fromUserId: task.assigneeId, toUserId: who, byUserId: actor.id, note: "Moved on the team schedule" } });
      await notify(tx, [who], {
        type: "task.assigned", title: `Handed to you: ${task.title}`, body: `${actor.name} scheduled ${taskRef(task.number)} for you.`,
        taskId: task.id, link: link(task.number),
      }, actor.id);
      await notify(tx, [task.assigneeId], { type: "task.reassigned", title: `Reassigned: ${task.title}`, taskId: task.id, link: link(task.number) }, actor.id);
      await audit(actor, "task.reassign", "Task", task.id, { before: { assigneeId: task.assigneeId }, after: { assigneeId: who }, tx });
    } else {
      await notify(tx, [who], {
        type: "task.scheduled", title: `Scheduled: ${task.title}`, body: `${actor.name} booked time for ${taskRef(task.number)}.`,
        taskId: task.id, link: link(task.number), dedupeKey: `sched:${task.id}:${start.toISOString()}`,
      }, actor.id);
    }
    return { ok: true, task: await tx.task.findUniqueOrThrow({ where: { id: task.id }, include: taskListInclude }) };
  });
}

// ───────────────────────────── planned finish ─────────────────────────────

export const planSchema = z.object({ plannedAt: z.string().datetime({ offset: true }).nullable() });

/**
 * The person doing a task puts it on a day of their own calendar: "I'll have it done by then". The people who gave
 * it out (and review it) see that day and are told when it is set or moved. It never changes the deadline.
 */
export async function planTask(actor: SessionUser, id: string, raw: unknown) {
  const { plannedAt } = planSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const task = await loadForActor(tx, actor, id);
    if (task.assigneeId !== actor.id && !canManageTask(actor, task)) throw forbidden("Only the person doing this task can plan it.");
    if (CLOSED_STATUSES.includes(task.status as StatusKey)) throw invalid(`A ${statusLabel(task.status).toLowerCase()} task can't be planned.`);
    const at = plannedAt ? new Date(plannedAt) : null;
    await tx.task.update({ where: { id: task.id }, data: { plannedAt: at, version: { increment: 1 } } });
    await activity(tx, actor.id, "task.planned", { taskId: task.id }, { plannedAt: at, from: task.plannedAt });
    if (at) {
      const late = task.dueAt && at > task.dueAt;
      const when = at.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: process.env.APP_TIMEZONE ?? "Africa/Cairo" });
      await notify(tx, [task.creatorId, task.reviewerId], {
        type: "task.planned", title: `${actor.name} plans to finish ${taskRef(task.number)} on ${when}${late ? " — after the deadline" : ""}`,
        body: task.title, taskId: task.id, link: link(task.number), dedupeKey: `plan:${task.id}:${at.toISOString()}`,
      }, actor.id);
    }
    return { ok: true, plannedAt: at, afterDeadline: !!(at && task.dueAt && at > task.dueAt) };
  });
}

// ───────────────────────── structure & housekeeping ─────────────────────────

export async function addDependency(actor: SessionUser, id: string, dependsOnId: string) {
  return db.$transaction(async (tx) => {
    const task = await loadForActor(tx, actor, id);
    if (!canManageTask(actor, task)) throw forbidden();
    const dep = await loadForActor(tx, actor, dependsOnId);
    if (dep.id === task.id) throw invalid("A task cannot depend on itself.");
    await assertNoDependencyCycle(tx, task.id, dep.id);
    const row = await tx.taskDependency.create({ data: { taskId: task.id, dependsOnId: dep.id } });
    await activity(tx, actor.id, "task.dependency_added", { taskId: task.id }, { dependsOn: dep.number });
    return row;
  });
}

export async function removeDependency(actor: SessionUser, id: string, dependsOnId: string) {
  const task = await loadForActor(db, actor, id);
  if (!canManageTask(actor, task)) throw forbidden();
  await db.taskDependency.deleteMany({ where: { taskId: task.id, dependsOnId } });
  await activity(db, actor.id, "task.dependency_removed", { taskId: task.id });
}

export async function archiveTask(actor: SessionUser, id: string, archived: boolean) {
  return db.$transaction(async (tx) => {
    const task = await loadForActor(tx, actor, id);
    if (!canManageTask(actor, task)) throw forbidden();
    await tx.task.updateMany({ where: { OR: [{ id: task.id }, { parentId: task.id }] }, data: { archivedAt: archived ? new Date() : null, version: { increment: 1 } } });
    await activity(tx, actor.id, archived ? "task.archived" : "task.restored", { taskId: task.id });
    await audit(actor, archived ? "task.archive" : "task.unarchive", "Task", task.id, { tx });
  });
}

export async function duplicateTask(actor: SessionUser, id: string) {
  const src = await db.task.findFirst({ where: { AND: [{ id }, taskScope(actor)] }, include: { ...permInclude, checklist: true } });
  if (!src) throw notFound("Task");
  if (!canManageTask(actor, src)) throw forbidden();
  return createTask(actor, {
    title: `${src.title} (copy)`.slice(0, 200), description: src.description, projectId: src.projectId, parentId: src.parentId,
    department: src.department?.key ?? null, priority: src.priority, labels: src.labels,
    estimateMinutes: src.estimateMinutes, checklist: src.checklist.map((c) => c.text),
    dueAt: src.dueAt?.toISOString() ?? null,
  });
}

// ─────────────────────────── checklist / comments ───────────────────────────

async function assertCanContribute(tx: Tx | typeof db, actor: SessionUser, id: string) {
  const task = await loadForActor(tx, actor, id);
  if (!canManageTask(actor, task) && task.assigneeId !== actor.id && task.reviewerId !== actor.id) throw forbidden();
  return task;
}

export async function addChecklistItem(actor: SessionUser, id: string, text: string) {
  const t = z.string().trim().min(1).max(300).parse(text);
  const task = await assertCanContribute(db, actor, id);
  const count = await db.checklistItem.count({ where: { taskId: task.id } });
  return db.checklistItem.create({ data: { taskId: task.id, text: t, position: count } });
}

export async function updateChecklistItem(actor: SessionUser, itemId: string, patch: { done?: boolean; text?: string }) {
  const item = await db.checklistItem.findUnique({ where: { id: itemId } });
  if (!item) throw notFound("Checklist item");
  await assertCanContribute(db, actor, item.taskId);
  return db.checklistItem.update({
    where: { id: itemId },
    data: { done: patch.done ?? undefined, text: patch.text ? z.string().trim().min(1).max(300).parse(patch.text) : undefined },
  });
}

export async function deleteChecklistItem(actor: SessionUser, itemId: string) {
  const item = await db.checklistItem.findUnique({ where: { id: itemId } });
  if (!item) throw notFound("Checklist item");
  await assertCanContribute(db, actor, item.taskId);
  await db.checklistItem.delete({ where: { id: itemId } });
}

export async function addComment(actor: SessionUser, id: string, raw: unknown) {
  const input = z.object({ body: z.string().trim().min(1).max(10_000), mentions: z.array(z.string()).max(20).optional() }).parse(raw);
  return db.$transaction(async (tx) => {
    const task = await loadForActor(tx, actor, id);
    // Mentions only notify people who can actually see this task.
    const mentionIds: string[] = [];
    for (const uid of input.mentions ?? []) {
      const u = await tx.user.findUnique({ where: { id: uid }, include: { department: true } });
      if (!u?.isActive) continue;
      const visible = await tx.task.count({ where: { AND: [{ id: task.id }, taskScope(toSessionUser(u))] } });
      if (visible) mentionIds.push(u.id);
    }
    const c = await tx.comment.create({ data: { taskId: task.id, authorId: actor.id, body: input.body, mentions: mentionIds }, include: { author: { select: personSelect } } });
    await activity(tx, actor.id, "task.comment", { taskId: task.id });
    const full = await tx.task.findUniqueOrThrow({ where: { id: task.id }, select: { number: true, title: true } });
    await notify(tx, mentionIds, { type: "comment.mention", title: `${actor.name} mentioned you`, body: input.body.slice(0, 240), taskId: task.id, link: link(full.number) }, actor.id);
    await notify(tx, [task.assigneeId, task.reviewerId, task.creatorId].filter((x) => !mentionIds.includes(x ?? "")), {
      type: "comment", title: `New comment on ${taskRef(full.number)}`, body: `${actor.name}: ${input.body.slice(0, 200)}`, taskId: task.id, link: link(full.number),
    }, actor.id);
    return c;
  });
}

// ───────────────────────────── time tracking ─────────────────────────────

async function stopTimers(tx: Tx, userId: string, taskId?: string) {
  const running = await tx.timeEntry.findMany({ where: { userId, endedAt: null, ...(taskId ? { taskId } : {}) } });
  const now = new Date();
  for (const r of running) {
    const minutes = Math.max(1, Math.round((now.getTime() - r.startedAt.getTime()) / 60_000));
    await tx.timeEntry.update({ where: { id: r.id }, data: { endedAt: now, minutes: Math.min(minutes, 16 * 60) } });
  }
}

export async function startTimer(actor: SessionUser, id: string) {
  return db.$transaction(async (tx) => {
    const task = await loadForActor(tx, actor, id);
    if (task.assigneeId !== actor.id) throw forbidden("Only the assignee can track time on this task.");
    await stopTimers(tx, actor.id); // one timer at a time
    return tx.timeEntry.create({ data: { taskId: task.id, userId: actor.id, startedAt: new Date() } });
  });
}

export async function stopTimer(actor: SessionUser) {
  return db.$transaction((tx) => stopTimers(tx, actor.id));
}

export async function logTime(actor: SessionUser, id: string, raw: unknown) {
  const input = z.object({ minutes: z.number().int().min(1).max(16 * 60), note: z.string().max(500).optional(), date: z.string().optional() }).parse(raw);
  const task = await loadForActor(db, actor, id);
  if (task.assigneeId !== actor.id && !canManageTask(actor, task)) throw forbidden();
  const at = input.date ? new Date(input.date) : new Date();
  return db.timeEntry.create({ data: { taskId: task.id, userId: actor.id, minutes: input.minutes, note: input.note, startedAt: at, endedAt: at } });
}

// ───────────────────────────── bulk ─────────────────────────────

export const bulkSchema = z.object({
  ids: z.array(z.string()).min(1).max(200),
  action: z.enum(["status", "priority", "assign", "archive", "due"]),
  value: z.string().nullable().optional(),
});

export async function bulkUpdate(actor: SessionUser, raw: unknown) {
  const input = bulkSchema.parse(raw);
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const id of input.ids) {
    try {
      if (input.action === "status") await changeStatus(actor, id, { status: input.value, reason: "Bulk update" });
      else if (input.action === "priority") await updateTask(actor, id, { priority: input.value });
      else if (input.action === "assign") await updateTask(actor, id, { assigneeId: input.value || null, onConflict: "unschedule", handoffNote: "Bulk reassignment" });
      else if (input.action === "due") await updateTask(actor, id, { dueAt: input.value || null });
      else await archiveTask(actor, id, true);
      results.push({ id, ok: true });
    } catch (e) {
      results.push({ id, ok: false, error: e instanceof Error ? e.message : "Failed" });
    }
  }
  return { results, succeeded: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length };
}

export { isAdmin };
