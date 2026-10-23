import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { MANAGER_DEPARTMENT } from "@/lib/constants";
import { AppError, forbidden, invalid, notFound } from "../errors";
import { audit } from "../audit";
import { createResetToken, generatePassword, hashPassword, unusablePasswordHash } from "../auth";
import { isAdmin, isManager, peopleScope, type SessionUser } from "../permissions";

const requireAdmin = (u: SessionUser) => {
  if (!isAdmin(u)) throw forbidden("Administrator access required.");
};

// ───────────────────────────── users ─────────────────────────────

export const publicUserSelect = {
  id: true, name: true, email: true, role: true, title: true, phone: true, bio: true, avatarColor: true, isActive: true,
  isTestAccount: true, workDays: true, workStartMin: true, workEndMin: true, weeklyCapacityMin: true, lastLoginAt: true,
  createdAt: true, departmentId: true,
  department: { select: { id: true, key: true, name: true, color: true } },
  memberships: { select: { team: { select: { id: true, name: true } } } },
} satisfies Prisma.UserSelect;

export async function listPeople(actor: SessionUser, opts: { includeInactive?: boolean; department?: string; q?: string } = {}) {
  return db.user.findMany({
    where: {
      AND: [
        peopleScope(actor),
        opts.includeInactive && isAdmin(actor) ? {} : { isActive: true },
        opts.department ? { department: { key: opts.department } } : {},
        opts.q ? { OR: [{ name: { contains: opts.q, mode: "insensitive" } }, { email: { contains: opts.q, mode: "insensitive" } }] } : {},
      ],
    },
    select: publicUserSelect,
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
}

/** People `actor` may assign a task in `deptKey` to — powers every assignee picker. */
export async function eligibleAssignees(actor: SessionUser, deptKey: string | null) {
  if (!isManager(actor)) return db.user.findMany({ where: { id: actor.id }, select: publicUserSelect });
  const mgrDept = MANAGER_DEPARTMENT[actor.role];
  const where: Prisma.UserWhereInput = { isActive: true };
  const and: Prisma.UserWhereInput[] = [];
  if (mgrDept) and.push({ department: { key: mgrDept } });
  if (actor.role === "ACCOUNT_MANAGER") and.push({ role: { not: "ADMIN" } });
  if (deptKey && deptKey !== "ACCOUNTS" && deptKey !== "MANAGEMENT") {
    and.push({ OR: [{ department: { key: deptKey } }, { role: { in: ["ADMIN", "ACCOUNT_MANAGER"] } }] });
  }
  return db.user.findMany({ where: { ...where, AND: and }, select: publicUserSelect, orderBy: [{ role: "asc" }, { name: "asc" }] });
}

const workSchema = {
  workDays: z.array(z.number().int().min(1).max(7)).min(1).max(7).optional(),
  workStartMin: z.number().int().min(0).max(1439).optional(),
  workEndMin: z.number().int().min(1).max(1440).optional(),
  weeklyCapacityMin: z.number().int().min(0).max(100 * 60).optional(),
};

export const userSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(["ADMIN", "ACCOUNT_MANAGER", "PERFORMANCE_MANAGER", "PRODUCTION_MANAGER", "EMPLOYEE"]),
  department: z.string().nullable().optional(),
  title: z.string().max(100).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  teamIds: z.array(z.string()).max(20).optional(),
  ...workSchema,
});

async function deptIdForRole(role: string, deptKey: string | null | undefined) {
  const forced = MANAGER_DEPARTMENT[role as keyof typeof MANAGER_DEPARTMENT];
  if (forced && deptKey && deptKey !== forced) throw invalid(`A ${role.replace("_", " ").toLowerCase()} must belong to the ${forced.toLowerCase()} department.`);
  const key = forced ?? deptKey ?? (role === "ADMIN" ? "MANAGEMENT" : role === "ACCOUNT_MANAGER" ? "ACCOUNTS" : null);
  if (!key) return null;
  const d = await db.department.findUnique({ where: { key } });
  if (!d) throw invalid("Unknown department.");
  return d.id;
}

function checkHours(w: { workStartMin?: number; workEndMin?: number }) {
  if (w.workStartMin !== undefined && w.workEndMin !== undefined && w.workEndMin <= w.workStartMin) {
    throw invalid("Working hours must end after they start.");
  }
}

/** Creates the user with no usable password and returns a one-time setup link (no email service needed). */
export async function createUser(actor: SessionUser, raw: unknown) {
  requireAdmin(actor);
  const input = userSchema.parse(raw);
  checkHours(input);
  if (await db.user.findUnique({ where: { email: input.email } })) throw new AppError("CONFLICT", "A user with that email already exists.");
  const departmentId = await deptIdForRole(input.role, input.department);
  const user = await db.user.create({
    data: {
      name: input.name, email: input.email, role: input.role, departmentId, title: input.title, phone: input.phone,
      avatarColor: input.avatarColor ?? "#7c3aed", passwordHash: await unusablePasswordHash(), mustChangePassword: false,
      workDays: input.workDays, workStartMin: input.workStartMin, workEndMin: input.workEndMin, weeklyCapacityMin: input.weeklyCapacityMin,
      memberships: input.teamIds?.length ? { create: input.teamIds.map((teamId) => ({ teamId })) } : undefined,
    },
  });
  const token = await createResetToken(user.id, actor.id);
  await audit(actor, "user.create", "User", user.id, { after: { email: user.email, role: user.role } });
  return { user, setupPath: `/reset-password?token=${token}` };
}

export async function updateUser(actor: SessionUser, id: string, raw: unknown) {
  const self = actor.id === id;
  if (!isAdmin(actor) && !self) throw forbidden();
  const before = await db.user.findUnique({ where: { id }, include: { memberships: true } });
  if (!before) throw notFound("User");

  if (!isAdmin(actor)) {
    // Self-service profile: no role, email, department, or schedule changes.
    const p = z.object({
      name: z.string().trim().min(2).max(100).optional(), title: z.string().max(100).nullable().optional(),
      phone: z.string().max(40).nullable().optional(), bio: z.string().max(1000).nullable().optional(),
      avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    }).strict().parse(raw);
    return db.user.update({ where: { id }, data: p, select: publicUserSelect });
  }

  const input = userSchema.partial().extend({ isActive: z.boolean().optional(), bio: z.string().max(1000).nullable().optional() }).parse(raw);
  checkHours({ workStartMin: input.workStartMin ?? before.workStartMin, workEndMin: input.workEndMin ?? before.workEndMin });
  if (self && (input.isActive === false || (input.role && input.role !== "ADMIN"))) {
    throw invalid("You cannot deactivate or demote your own account.");
  }
  if ((input.isActive === false || (input.role && input.role !== "ADMIN")) && before.role === "ADMIN") {
    const admins = await db.user.count({ where: { role: "ADMIN", isActive: true, id: { not: id } } });
    if (!admins) throw invalid("At least one active administrator must remain.");
  }
  const role = input.role ?? before.role;
  const departmentId = input.role || input.department !== undefined
    ? await deptIdForRole(role, input.department === undefined ? (await db.department.findUnique({ where: { id: before.departmentId ?? "" } }))?.key : input.department)
    : undefined;

  const user = await db.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id },
      data: {
        name: input.name, email: input.email, role: input.role, departmentId, title: input.title, phone: input.phone, bio: input.bio,
        avatarColor: input.avatarColor, isActive: input.isActive, workDays: input.workDays, workStartMin: input.workStartMin,
        workEndMin: input.workEndMin, weeklyCapacityMin: input.weeklyCapacityMin,
      },
      select: publicUserSelect,
    });
    if (input.teamIds) {
      await tx.teamMember.deleteMany({ where: { userId: id, teamId: { notIn: input.teamIds } } });
      for (const teamId of input.teamIds) {
        await tx.teamMember.upsert({ where: { teamId_userId: { teamId, userId: id } }, create: { teamId, userId: id }, update: {} });
      }
    }
    if (input.isActive === false) await tx.session.deleteMany({ where: { userId: id } });
    return u;
  });
  await audit(actor, input.isActive === false ? "user.deactivate" : "user.update", "User", id, {
    before: { role: before.role, isActive: before.isActive, email: before.email, departmentId: before.departmentId },
    after: { role: user.role, isActive: user.isActive, email: user.email, departmentId: user.departmentId },
  });
  return user;
}

export async function issueResetLink(actor: SessionUser, id: string) {
  requireAdmin(actor);
  const user = await db.user.findUnique({ where: { id } });
  if (!user) throw notFound("User");
  const token = await createResetToken(user.id, actor.id);
  await audit(actor, "user.reset_link", "User", user.id);
  return { resetPath: `/reset-password?token=${token}`, expiresInMinutes: 60 };
}

export async function setTemporaryPassword(actor: SessionUser, id: string) {
  requireAdmin(actor);
  const pw = generatePassword();
  await db.user.update({ where: { id }, data: { passwordHash: await hashPassword(pw), mustChangePassword: true } });
  await db.session.deleteMany({ where: { userId: id } });
  await audit(actor, "user.temp_password", "User", id);
  return { temporaryPassword: pw };
}

// ───────────────────────────── teams ─────────────────────────────

export const teamSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().max(500).nullable().optional(),
  department: z.string(),
  managerId: z.string().nullable().optional(),
  memberIds: z.array(z.string()).max(200).optional(),
});

async function validateTeam(input: { department?: string; managerId?: string | null; memberIds?: string[] }, deptKey: string) {
  if (input.managerId) {
    const m = await db.user.findUnique({ where: { id: input.managerId }, include: { department: true } });
    if (!m?.isActive) throw invalid("Team manager must be an active user.");
    if (m.role === "EMPLOYEE") throw invalid("An employee cannot be a team manager. Change their role first.");
    const forced = MANAGER_DEPARTMENT[m.role];
    if (forced && forced !== deptKey) throw invalid(`${m.name} manages ${forced.toLowerCase()} and cannot lead a ${deptKey.toLowerCase()} team.`);
  }
  if (input.memberIds) {
    if (new Set(input.memberIds).size !== input.memberIds.length) throw invalid("A person can only be added to a team once.");
    const members = await db.user.findMany({ where: { id: { in: input.memberIds } }, include: { department: true } });
    if (members.length !== input.memberIds.length) throw invalid("One of the members does not exist.");
    const wrong = members.find((m) => m.department && m.department.key !== deptKey && m.role !== "ADMIN" && m.role !== "ACCOUNT_MANAGER");
    if (wrong) throw invalid(`${wrong.name} belongs to ${wrong.department!.name}, not this team's department.`);
  }
}

export async function listTeams(actor: SessionUser) {
  return db.team.findMany({
    where: isAdmin(actor) || actor.role === "ACCOUNT_MANAGER" ? {} : { OR: [{ managerId: actor.id }, { members: { some: { userId: actor.id } } }, ...(actor.departmentKey ? [{ department: { key: actor.departmentKey } }] : [])] },
    include: {
      department: true,
      manager: { select: { id: true, name: true, avatarColor: true } },
      members: { include: { user: { select: { id: true, name: true, avatarColor: true, role: true, isActive: true, title: true } } } },
    },
    orderBy: { name: "asc" },
  });
}

export async function createTeam(actor: SessionUser, raw: unknown) {
  requireAdmin(actor);
  const input = teamSchema.parse(raw);
  const dept = await db.department.findUnique({ where: { key: input.department } });
  if (!dept) throw invalid("Unknown department.");
  await validateTeam(input, dept.key);
  const team = await db.team.create({
    data: {
      name: input.name, description: input.description, departmentId: dept.id, managerId: input.managerId ?? null,
      members: { create: (input.memberIds ?? []).map((userId) => ({ userId })) },
    },
  });
  await audit(actor, "team.create", "Team", team.id, { after: input });
  return team;
}

export async function updateTeam(actor: SessionUser, id: string, raw: unknown) {
  requireAdmin(actor);
  const input = teamSchema.partial().parse(raw);
  const team = await db.team.findUnique({ where: { id }, include: { department: true, members: true } });
  if (!team) throw notFound("Team");
  const dept = input.department ? await db.department.findUnique({ where: { key: input.department } }) : team.department;
  if (!dept) throw invalid("Unknown department.");
  await validateTeam(input, dept.key);
  const updated = await db.$transaction(async (tx) => {
    const t = await tx.team.update({
      where: { id },
      data: { name: input.name, description: input.description, departmentId: dept.id, managerId: input.managerId },
    });
    if (input.memberIds) {
      await tx.teamMember.deleteMany({ where: { teamId: id, userId: { notIn: input.memberIds } } });
      for (const userId of input.memberIds) {
        await tx.teamMember.upsert({ where: { teamId_userId: { teamId: id, userId } }, create: { teamId: id, userId }, update: {} });
      }
    }
    return t;
  });
  await audit(actor, "team.update", "Team", id, { before: { name: team.name, managerId: team.managerId, members: team.members.map((m) => m.userId) }, after: input });
  return updated;
}

export async function deleteTeam(actor: SessionUser, id: string) {
  requireAdmin(actor);
  const team = await db.team.findUnique({ where: { id } });
  if (!team) throw notFound("Team");
  await db.team.delete({ where: { id } });
  await audit(actor, "team.delete", "Team", id, { before: { name: team.name } });
}

// ───────────────────────────── leave ─────────────────────────────

export const leaveSchema = z.object({
  userId: z.string(),
  type: z.enum(["VACATION", "SICK", "UNAVAILABLE", "OTHER"]),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  note: z.string().max(300).nullable().optional(),
});

export async function listLeaves(actor: SessionUser, from?: Date, to?: Date) {
  return db.leave.findMany({
    where: {
      user: peopleScope(actor),
      ...(from ? { endsAt: { gt: from } } : {}),
      ...(to ? { startsAt: { lt: to } } : {}),
    },
    include: { user: { select: { id: true, name: true, avatarColor: true } } },
    orderBy: { startsAt: "asc" },
  });
}

export async function createLeave(actor: SessionUser, raw: unknown) {
  const input = leaveSchema.parse(raw);
  const allowed = isAdmin(actor) || input.userId === actor.id ||
    ((actor.role === "PERFORMANCE_MANAGER" || actor.role === "PRODUCTION_MANAGER") &&
      (await db.user.count({ where: { id: input.userId, department: { key: MANAGER_DEPARTMENT[actor.role]! } } })) > 0);
  if (!allowed) throw forbidden("You cannot record leave for that person.");
  const startsAt = new Date(input.startsAt), endsAt = new Date(input.endsAt);
  if (endsAt <= startsAt) throw invalid("Leave must end after it starts.");
  const leave = await db.leave.create({ data: { ...input, startsAt, endsAt, createdById: actor.id } });
  // Work booked during the leave now needs attention.
  const clashes = await db.task.findMany({
    where: { assigneeId: input.userId, archivedAt: null, status: { notIn: ["APPROVED", "CANCELLED"] }, scheduledStart: { lt: endsAt }, scheduledEnd: { gt: startsAt } },
    select: { id: true, number: true, title: true },
  });
  await audit(actor, "leave.create", "Leave", leave.id, { after: input });
  return { leave, clashes };
}

export async function deleteLeave(actor: SessionUser, id: string) {
  const leave = await db.leave.findUnique({ where: { id } });
  if (!leave) throw notFound("Leave");
  if (!isAdmin(actor) && leave.userId !== actor.id && leave.createdById !== actor.id) throw forbidden();
  await db.leave.delete({ where: { id } });
  await audit(actor, "leave.delete", "Leave", id, { before: leave });
}

// ───────────────────────────── departments ─────────────────────────────

export const listDepartments = () => db.department.findMany({ orderBy: { name: "asc" } });
