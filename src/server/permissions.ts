import type { Prisma, Role } from "@prisma/client";
import { MANAGER_DEPARTMENT, isWorkerRole } from "@/lib/constants";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  departmentId: string | null;
  departmentKey: string | null;
  isTestAccount: boolean;
  mustChangePassword: boolean;
  onboarded: boolean;
  avatarColor: string;
};

/** Departments that work for every account manager (an Accounts employee works only for their own manager's team). */
export const SHARED_DEPARTMENTS = ["PRODUCTION", "PERFORMANCE"];

export const isAdmin = (u: SessionUser) => u.role === "ADMIN";
export const isAccountManager = (u: SessionUser) => u.role === "ACCOUNT_MANAGER";
export const isDeptManager = (u: SessionUser) => u.role === "PERFORMANCE_MANAGER" || u.role === "PRODUCTION_MANAGER";
export const isManager = (u: SessionUser) => isAdmin(u) || isAccountManager(u) || isDeptManager(u);
export const isWorker = (u: SessionUser) => isWorkerRole(u.role);
export const isSocialSpecialist = (u: SessionUser) => u.role === "SOCIAL_MEDIA_SPECIALIST";
export const managerDeptKey = (u: SessionUser) => MANAGER_DEPARTMENT[u.role] ?? null;

/** Prisma filter for the tasks a user may see. Every task query must be AND-ed with this. */
export function taskScope(u: SessionUser): Prisma.TaskWhereInput {
  if (isAdmin(u)) return {};
  const mine: Prisma.TaskWhereInput[] = [{ assigneeId: u.id }, { creatorId: u.id }, { reviewerId: u.id }];
  if (isAccountManager(u)) {
    // Also the parts their managers split further (two levels down the chain they started).
    const involved: Prisma.TaskWhereInput = { OR: [{ assigneeId: u.id }, { creatorId: u.id }] };
    return { OR: [...mine, { project: { accountManagerId: u.id } }, { parent: involved }, { parent: { parent: involved } }] };
  }
  if (isDeptManager(u)) {
    return { OR: [...mine, { department: { key: managerDeptKey(u)! } }] };
  }
  // The social media specialist also follows (read-only) the work of every social media project.
  if (isSocialSpecialist(u)) return { OR: [{ assigneeId: u.id }, { creatorId: u.id }, { project: { kind: "SOCIAL_MEDIA" } }] };
  return { OR: [{ assigneeId: u.id }, { creatorId: u.id }] };
}

export function projectScope(u: SessionUser): Prisma.ProjectWhereInput {
  if (isAdmin(u)) return {};
  if (isAccountManager(u)) return { accountManagerId: u.id };
  if (isSocialSpecialist(u)) return { OR: [{ kind: "SOCIAL_MEDIA" }, { tasks: { some: { AND: [{ assigneeId: u.id }, { archivedAt: null }] } } }] };
  // Managers / employees see projects they have visible work in.
  return { tasks: { some: { AND: [taskScope(u), { archivedAt: null }] } } };
}

export function clientScope(u: SessionUser): Prisma.ClientWhereInput {
  if (isAdmin(u)) return {};
  if (isAccountManager(u)) return { OR: [{ accountManagerId: u.id }, { projects: { some: { accountManagerId: u.id } } }] };
  if (isDeptManager(u)) return { projects: { some: projectScope(u) } };
  return { id: "__none__" }; // employees never browse client records
}

/**
 * A staged order ("30 Videos Social Media") is the plan the account manager splits into steps; it is not work by
 * itself, so it is left out of work lists, calendars and counts. Its steps (the parts) are the work.
 */
export const notPlan: Prisma.TaskWhereInput = { NOT: { stage: null, parentId: null, quantity: { not: null }, type: { stages: { isEmpty: false } } } };

/** Users whose schedules / workload this user may inspect. */
export function peopleScope(u: SessionUser): Prisma.UserWhereInput {
  if (isAdmin(u)) return {};
  if (isAccountManager(u)) {
    // Their own team, plus the shared Production / Performance departments every account manager books.
    return {
      OR: [
        { id: u.id },
        { role: { in: ["PERFORMANCE_MANAGER", "PRODUCTION_MANAGER"] } },
        { role: "EMPLOYEE", department: { key: { in: SHARED_DEPARTMENTS } } },
        { role: { in: ["SOCIAL_MEDIA_SPECIALIST", "EXTERNAL"] } },
        { memberships: { some: { team: { managerId: u.id } } } },
      ],
    };
  }
  if (isDeptManager(u)) return { OR: [{ id: u.id }, { department: { key: managerDeptKey(u)! } }] };
  return { id: u.id };
}

type TaskForPerm = {
  creatorId: string;
  assigneeId: string | null;
  reviewerId: string | null;
  department?: { key: string } | null;
  project?: { accountManagerId: string | null } | null;
};

/** May change ownership, dates, priority, structure. */
export function canManageTask(u: SessionUser, t: TaskForPerm) {
  if (isAdmin(u)) return true;
  if (isAccountManager(u)) return t.project?.accountManagerId === u.id || t.creatorId === u.id;
  if (isDeptManager(u)) return t.department?.key === managerDeptKey(u) || t.creatorId === u.id;
  return false;
}

/** May approve / request changes. Nobody reviews their own work. */
export function canReviewTask(u: SessionUser, t: TaskForPerm) {
  if (t.assigneeId === u.id) return false;
  if (t.reviewerId === u.id) return true;
  return canManageTask(u, t);
}

export function canWorkOnTask(u: SessionUser, t: TaskForPerm) {
  return t.assigneeId === u.id;
}

/** Which department a manager may create/route work into. */
export function canUseDepartment(u: SessionUser, deptKey: string | null | undefined) {
  if (isAdmin(u) || isAccountManager(u)) return true;
  if (isDeptManager(u)) return deptKey === managerDeptKey(u);
  return false;
}
