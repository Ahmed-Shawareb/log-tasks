import "server-only";
import { z } from "zod";
import { Prisma, type Priority, type TaskStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { taskRef } from "@/lib/utils";
import { CLOSED_STATUSES, STATUS_META, type StatusKey } from "@/lib/constants";
import { canSubmit, canBeReviewed, canTransition } from "@/lib/workflow";
import { AppError, forbidden, invalid, notFound } from "../errors";
import { activity, audit, notify } from "../audit";
import {
  canManageTask, canReviewTask, canUseDepartment, isAccountManager, isAdmin, isDeptManager, isManager, managerDeptKey,
  taskScope, type SessionUser,
} from "../permissions";
import { checkAvailability, lockPerson } from "./availability";

type Tx = Prisma.TransactionClient;

// ───────────────────────────── shapes ─────────────────────────────

const personSelect = { id: true, name: true, avatarColor: true, email: true, role: true } as const;

export const taskListInclude = {
  assignee: { select: personSelect },
  reviewer: { select: personSelect },
  project: { select: { id: true, name: true, color: true, accountManagerId: true, client: { select: { id: true, name: true } } } },
  department: { select: { id: true, key: true, name: true, color: true } },
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
  return { items, total, page, pageSize };
}

// ───────────────────────────── detail ─────────────────────────────

export async function getTaskDetail(actor: SessionUser, idOrNumber: string) {
  const asNum = /^\d+$/.test(idOrNumber) ? Number(idOrNumber) : null;
  const task = await db.task.findFirst({
    where: { AND: [asNum ? { number: asNum } : { id: idOrNumber }, taskScope(actor)] },
    include: {
      ...taskListInclude,
      creator: { select: personSelect },
      project: { select: { id: true, name: true, color: true, accountManagerId: true, client: { select: { id: true, name: true } } } },
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
  const runningTimer = task.timeEntries.find((e) => !e.endedAt && e.userId === actor.id) ?? null;
  const perms = {
    canManage: canManageTask(actor, task),
    canReview: canReviewTask(actor, task),
    isAssignee: task.assigneeId === actor.id,
    canComment: true,
  };
  return { ...task, children, loggedMinutes, runningTimer, perms };
}
export type TaskDetail = Awaited<ReturnType<typeof getTaskDetail>>;

// ─────────────────────────── assignment rules ───────────────────────────

async function resolveDepartment(tx: Tx | typeof db, key: string | null | undefined) {
  if (!key) return null;
  const d = await tx.department.findUnique({ where: { key } });
  if (!d) throw invalid("Unknown department.");
  return d;
}

/** Throws unless `assigneeId` is an active user that `actor` may hand this work to. */
export async function assertAssignable(tx: Tx | typeof db, actor: SessionUser, assigneeId: string, deptKey: string | null) {
  const a = await tx.user.findUnique({ where: { id: assigneeId }, include: { department: true } });
  if (!a) throw invalid("Assignee does not exist.");
  if (!a.isActive) throw invalid(`${a.name} is inactive and cannot receive new work.`);
  if (actor.role === "EMPLOYEE" && a.id !== actor.id) throw forbidden("Employees cannot assign work to others.");
  if (isDeptManager(actor) && a.department?.key !== managerDeptKey(actor)) {
    throw forbidden(`You can only assign work to members of the ${managerDeptKey(actor)!.toLowerCase()} department.`);
  }
  if (isAccountManager(actor) && a.role === "ADMIN") throw forbidden("Account Managers cannot assign work to administrators.");
  const doer = a.role === "EMPLOYEE" || a.role === "PERFORMANCE_MANAGER" || a.role === "PRODUCTION_MANAGER";
  if (deptKey && doer && a.department?.key !== deptKey) {
    throw invalid(`${a.name} is not in the ${deptKey.toLowerCase()} department. Change the task's department or pick someone from that team.`);
  }
  return a;
}

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

// ───────────────────────────── create ─────────────────────────────

const dateish = z.union([z.string().datetime({ offset: true }), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).nullable().optional();
const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : new Date(v));

export const createTaskSchema = z.object({
  title: z.string().trim().min(2, "Title is too short").max(200),
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
  templateId: z.string().optional().nullable(),
  dependsOn: z.array(z.string()).max(20).optional(),
});

export async function createTask(actor: SessionUser, raw: unknown) {
  const input = createTaskSchema.parse(raw);
  if (!isManager(actor) && input.assigneeId && input.assigneeId !== actor.id) throw forbidden("Employees cannot assign work to others.");

  return db.$transaction(async (tx) => {
    let parent: Awaited<ReturnType<typeof loadForActor>> | null = null;
    if (input.parentId) {
      parent = await loadForActor(tx, actor, input.parentId);
      if (!canManageTask(actor, parent) && parent.assigneeId !== actor.id) throw forbidden("You cannot add subtasks to that task.");
    }
    const projectId = input.projectId ?? parent?.projectId ?? null;
    let project = null;
    if (projectId) {
      project = await tx.project.findUnique({ where: { id: projectId } });
      if (!project) throw invalid("Project does not exist.");
      if (isAccountManager(actor) && project.accountManagerId !== actor.id && !parent) {
        throw forbidden("You can only create work in projects you manage.");
      }
    }
    if (!isManager(actor) && !parent) throw forbidden("Employees can only create subtasks of their own tasks.");

    const deptKey = input.department ?? (parent?.department?.key ?? null) ?? (isDeptManager(actor) ? managerDeptKey(actor) : null);
    if (deptKey && !canUseDepartment(actor, deptKey) && !(parent && parent.assigneeId === actor.id)) {
      throw forbidden("You cannot create tasks for that department.");
    }
    if (isDeptManager(actor) && deptKey !== managerDeptKey(actor)) throw forbidden("Tasks you create must stay in your department.");
    const dept = await resolveDepartment(tx, deptKey);

    const assigneeId = input.assigneeId ?? (isManager(actor) ? null : actor.id);
    if (assigneeId) await assertAssignable(tx, actor, assigneeId, deptKey);
    let reviewerId = input.reviewerId ?? null;
    if (reviewerId) {
      const r = await tx.user.findUnique({ where: { id: reviewerId } });
      if (!r?.isActive || r.role === "EMPLOYEE") throw invalid("Reviewer must be an active manager.");
    } else if (isManager(actor) && assigneeId !== actor.id) {
      reviewerId = actor.id;
    } else if (parent?.reviewerId) {
      reviewerId = parent.reviewerId;
    }

    const template = input.templateId ? await tx.taskTemplate.findUnique({ where: { id: input.templateId } }) : null;
    const blueprint = (template?.blueprint ?? {}) as {
      checklist?: string[]; subtasks?: { title: string; departmentKey?: string; estimateMinutes?: number; offsetDays?: number }[];
    };

    const dueAt = toDate(input.dueAt) ?? null;
    const startDate = toDate(input.startDate) ?? null;
    if (dueAt && startDate && dueAt < startDate) throw invalid("Deadline cannot be before the start date.");

    const task = await tx.task.create({
      data: {
        title: input.title,
        description: input.description ?? template?.description ?? null,
        projectId, parentId: parent?.id ?? null, departmentId: dept?.id ?? null,
        creatorId: actor.id, assigneeId, reviewerId,
        priority: input.priority ?? template?.priority ?? "MEDIUM",
        status: input.status ?? (assigneeId ? "READY" : "BACKLOG"),
        startDate, dueAt, estimateMinutes: input.estimateMinutes ?? null,
        labels: [...new Set(input.labels ?? [])],
        checklist: {
          create: [...(blueprint.checklist ?? []), ...(input.checklist ?? [])].map((text, position) => ({ text, position })),
        },
      },
    });

    for (const sub of blueprint.subtasks ?? []) {
      const subDept = await resolveDepartment(tx, sub.departmentKey ?? deptKey);
      if (isDeptManager(actor) && subDept && subDept.key !== managerDeptKey(actor)) continue;
      await tx.task.create({
        data: {
          title: sub.title, parentId: task.id, projectId, departmentId: subDept?.id ?? null, creatorId: actor.id,
          reviewerId: reviewerId ?? actor.id, priority: task.priority, status: "BACKLOG",
          estimateMinutes: sub.estimateMinutes ?? null,
          dueAt: dueAt && sub.offsetDays !== undefined ? new Date(dueAt.getTime() - sub.offsetDays * 86_400_000) : dueAt,
        },
      });
    }

    for (const depId of input.dependsOn ?? []) {
      await loadForActor(tx, actor, depId);
      await tx.taskDependency.create({ data: { taskId: task.id, dependsOnId: depId } });
    }

    await activity(tx, actor.id, "task.created", { taskId: task.id, projectId: projectId ?? undefined }, {
      title: task.title, template: template?.name,
    });
    if (assigneeId) {
      await tx.handoff.create({ data: { taskId: task.id, toUserId: assigneeId, byUserId: actor.id, note: "Initial assignment" } });
      await notify(tx, [assigneeId], {
        type: "task.assigned", title: `New task: ${task.title}`, body: `${actor.name} assigned ${taskRef(task.number)} to you.`,
        taskId: task.id, link: link(task.number),
      }, actor.id);
    }
    await audit(actor, "task.create", "Task", task.id, { after: { title: task.title, assigneeId, projectId }, tx });
    return task;
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
        const p = await tx.project.findUnique({ where: { id: input.projectId } });
        if (!p) throw invalid("Project does not exist.");
        if (isAccountManager(actor) && p.accountManagerId !== actor.id) throw forbidden("You can only move work into projects you manage.");
      }
      set("projectId", input.projectId);
    }
    if (input.parentId !== undefined && input.parentId !== task.parentId) {
      if (input.parentId) {
        const p = await loadForActor(tx, actor, input.parentId);
        if (!canManageTask(actor, p)) throw forbidden("You cannot move work under that task.");
        await assertNoParentCycle(tx, task.id, input.parentId);
      }
      set("parentId", input.parentId);
    }
    if (input.reviewerId !== undefined && input.reviewerId !== task.reviewerId) {
      if (input.reviewerId) {
        const r = await tx.user.findUnique({ where: { id: input.reviewerId } });
        if (!r?.isActive || r.role === "EMPLOYEE") throw invalid("Reviewer must be an active manager.");
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
        await assertAssignable(tx, actor, input.assigneeId, deptKey);
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
    if (who !== task.assigneeId) await assertAssignable(tx, actor, who, task.department?.key ?? null);

    await lockPerson(tx, who);
    const avail = await checkAvailability(tx, who, start, end, { excludeTaskId: task.id, taskId: task.id });
    if (!avail.ok) throw new AppError("UNAVAILABLE", avail.message!, { conflicts: avail.conflicts, suggestions: avail.suggestions });
    if (input.dryRun) return { ok: true };

    const nextStatus = ["BACKLOG", "READY", "BLOCKED"].includes(task.status) && task.status !== "BLOCKED" ? "SCHEDULED" : task.status;
    await bump(tx, task.id, input.version, {
      scheduledStart: start, scheduledEnd: end, status: nextStatus, ...(who !== task.assigneeId ? { assigneeId: who } : {}),
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
      const visible = await tx.task.count({ where: { AND: [{ id: task.id }, taskScope({ ...u, departmentKey: u.department?.key ?? null } as SessionUser)] } });
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
