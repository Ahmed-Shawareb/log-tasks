import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { forbidden, invalid, notFound } from "../errors";
import { audit, activity, notify } from "../audit";
import { isWorkerRole } from "@/lib/constants";
import { MAX_POSTS, syncPostSlots } from "./social";
import { deleteObject } from "./files";
import { clientScope, isAccountManager, isAdmin, notPlan, projectScope, taskScope, type SessionUser } from "../permissions";

const canEditClients = (u: SessionUser) => isAdmin(u) || isAccountManager(u);

async function assertAccountManager(id: string | null | undefined) {
  if (!id) return;
  const u = await db.user.findUnique({ where: { id } });
  if (!u || !u.isActive || (u.role !== "ACCOUNT_MANAGER" && u.role !== "ADMIN")) {
    throw invalid("Account manager must be an active Account Manager.");
  }
}

// ───────────────────────────── clients ─────────────────────────────

export const clientSchema = z.object({
  name: z.string().trim().min(2).max(120),
  contactName: z.string().trim().max(120).nullable().optional(),
  contactEmail: z.string().trim().email().max(254).nullable().optional().or(z.literal("").transform(() => null)),
  contactPhone: z.string().trim().max(40).nullable().optional(),
  industry: z.string().trim().max(80).nullable().optional(),
  notes: z.string().max(10_000).nullable().optional(),
  status: z.enum(["PROSPECT", "ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
  accountManagerId: z.string().nullable().optional(),
});

export async function listClients(actor: SessionUser, opts: { q?: string; status?: string } = {}) {
  return db.client.findMany({
    where: {
      AND: [
        clientScope(actor),
        opts.q ? { OR: [{ name: { contains: opts.q, mode: "insensitive" } }, { contactName: { contains: opts.q, mode: "insensitive" } }] } : {},
        opts.status ? { status: opts.status as never } : { status: { not: "ARCHIVED" } },
      ],
    },
    include: {
      accountManager: { select: { id: true, name: true, avatarColor: true } },
      _count: { select: { projects: true } },
      projects: { select: { status: true } },
    },
    orderBy: { name: "asc" },
  });
}

export async function getClient(actor: SessionUser, id: string) {
  const c = await db.client.findFirst({
    where: { AND: [{ id }, clientScope(actor)] },
    include: {
      accountManager: { select: { id: true, name: true, avatarColor: true } },
      projects: { where: projectScope(actor), include: { accountManager: { select: { id: true, name: true } }, _count: { select: { tasks: true } } }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!c) throw notFound("Client");
  // Only admins see (and manage) the client's dashboard login.
  const portalLogin = isAdmin(actor)
    ? await db.clientUser.findFirst({ where: { clientId: id }, select: { email: true, isActive: true, lastLoginAt: true } })
    : null;
  return { ...c, portalLogin };
}

export async function createClient(actor: SessionUser, raw: unknown) {
  if (!canEditClients(actor)) throw forbidden();
  const { personal, ...input } = clientSchema.extend({ personal: z.boolean().optional() }).parse(raw);
  // A personal client belongs to its owner alone: nobody else is its account manager, and it can never become a LOG client.
  if (personal && !actor.canOwnPrivateClients) throw forbidden("Personal clients are not available for your account.");
  const amId = personal ? actor.id : isAccountManager(actor) ? (input.accountManagerId ?? actor.id) : input.accountManagerId;
  if (isAccountManager(actor) && amId !== actor.id) throw forbidden("You can only create clients you manage.");
  await assertAccountManager(amId);
  const c = await db.client.create({ data: { ...input, accountManagerId: amId ?? null, privateOwnerId: personal ? actor.id : null } });
  await audit(actor, "client.create", "Client", c.id, { after: { name: c.name } });
  return c;
}

export async function updateClient(actor: SessionUser, id: string, raw: unknown) {
  const before = await db.client.findFirst({ where: { AND: [{ id }, clientScope(actor)] } });
  if (!before) throw notFound("Client");
  if (!isAdmin(actor) && !(isAccountManager(actor) && before.accountManagerId === actor.id)) throw forbidden();
  const input = clientSchema.partial().parse(raw);
  if (input.accountManagerId !== undefined && !isAdmin(actor)) throw forbidden("Only administrators can change a client's account manager.");
  if (before.privateOwnerId && input.accountManagerId !== undefined && input.accountManagerId !== before.privateOwnerId) throw invalid("A personal client stays with its owner.");
  await assertAccountManager(input.accountManagerId);
  const c = await db.client.update({ where: { id }, data: input });
  await audit(actor, input.status === "ARCHIVED" ? "client.archive" : "client.update", "Client", id, { before, after: input });
  return c;
}

// ───────────────────────────── projects ─────────────────────────────

export const projectSchema = z.object({
  name: z.string().trim().min(2).max(160),
  clientId: z.string(),
  description: z.string().max(20_000).nullable().optional(),
  requirements: z.string().max(50_000).nullable().optional(),
  notes: z.string().max(20_000).nullable().optional(),
  accountManagerId: z.string().nullable().optional(),
  status: z.enum(["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  kind: z.enum(["STANDARD", "SOCIAL_MEDIA"]).optional(),
  /** Social media projects: how many posts the feed grid holds. */
  postCount: z.number().int().min(1).max(MAX_POSTS).nullable().optional(),
  startDate: z.string().nullable().optional(),
  targetDate: z.string().nullable().optional(),
});

const d = (v: string | null | undefined) => (v === undefined ? undefined : v ? new Date(v) : null);

export async function listProjects(actor: SessionUser, opts: { q?: string; status?: string; clientId?: string } = {}) {
  const projects = await db.project.findMany({
    where: {
      AND: [
        projectScope(actor),
        opts.clientId ? { clientId: opts.clientId } : {},
        opts.q ? { OR: [{ name: { contains: opts.q, mode: "insensitive" } }, { client: { name: { contains: opts.q, mode: "insensitive" } } }] } : {},
        opts.status ? { status: opts.status as never } : { status: { not: "ARCHIVED" } },
      ],
    },
    include: {
      client: { select: { id: true, name: true } },
      accountManager: { select: { id: true, name: true, avatarColor: true } },
    },
    orderBy: [{ status: "asc" }, { targetDate: { sort: "asc", nulls: "last" } }],
  });
  // Progress is computed from the tasks this viewer can see.
  const stats = await db.task.groupBy({
    by: ["projectId", "status"],
    where: { AND: [taskScope(actor), notPlan, { archivedAt: null, projectId: { in: projects.map((p) => p.id) } }] },
    _count: true,
  });
  return projects.map((p) => {
    const rows = stats.filter((s) => s.projectId === p.id);
    const total = rows.filter((r) => r.status !== "CANCELLED").reduce((a, r) => a + r._count, 0);
    const done = rows.filter((r) => r.status === "APPROVED").reduce((a, r) => a + r._count, 0);
    return { ...p, taskTotal: total, taskDone: done, progress: total ? Math.round((done / total) * 100) : 0 };
  });
}

export async function getProject(actor: SessionUser, id: string) {
  const p = await db.project.findFirst({
    where: { AND: [{ id }, projectScope(actor)] },
    include: { client: true, accountManager: { select: { id: true, name: true, avatarColor: true, email: true } } },
  });
  if (!p) throw notFound("Project");
  // Employees never see raw client contact info.
  if (isWorkerRole(actor.role)) {
    return { ...p, client: { ...p.client, contactEmail: null, contactPhone: null, contactName: null, notes: null }, notes: null };
  }
  return p;
}

export async function createProject(actor: SessionUser, raw: unknown) {
  if (!canEditClients(actor)) throw forbidden();
  const input = projectSchema.parse(raw);
  const client = await db.client.findFirst({ where: { AND: [{ id: input.clientId }, clientScope(actor)] } });
  if (!client) throw invalid("Client does not exist.");
  // Every project of a personal client is private to the same owner, who is also its account manager.
  const amId = client.privateOwnerId ?? (isAccountManager(actor) ? actor.id : (input.accountManagerId ?? client.accountManagerId));
  await assertAccountManager(amId);
  const start = d(input.startDate), target = d(input.targetDate);
  if (start && target && target < start) throw invalid("Target date cannot be before the start date.");
  if (input.kind === "SOCIAL_MEDIA" && !input.postCount) throw invalid("How many posts? A social media project needs the number of posts.");
  const postCount = input.kind === "SOCIAL_MEDIA" ? input.postCount! : null;
  const p = await db.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: { ...input, postCount, accountManagerId: amId ?? null, privateOwnerId: client.privateOwnerId, startDate: start ?? null, targetDate: target ?? null },
    });
    if (postCount) await syncPostSlots(tx, created.id, postCount);
    return created;
  });
  await activity(db, actor.id, "project.created", { projectId: p.id }, { name: p.name });
  if (amId) await notify(db, [amId], { type: "project.assigned", title: `New project: ${p.name}`, body: `${actor.name} made you account manager for ${client.name}.`, link: `/projects/${p.id}` }, actor.id);
  await audit(actor, "project.create", "Project", p.id, { after: { name: p.name, clientId: p.clientId, accountManagerId: amId } });
  return p;
}

export async function updateProject(actor: SessionUser, id: string, raw: unknown) {
  const before = await db.project.findFirst({ where: { AND: [{ id }, projectScope(actor)] } });
  if (!before) throw notFound("Project");
  if (!isAdmin(actor) && !(isAccountManager(actor) && before.accountManagerId === actor.id)) throw forbidden();
  const input = projectSchema.partial().parse(raw);
  if (input.accountManagerId !== undefined && input.accountManagerId !== before.accountManagerId && !isAdmin(actor)) {
    throw forbidden("Only administrators can change a project's account manager.");
  }
  if (before.privateOwnerId && input.accountManagerId !== undefined && input.accountManagerId !== before.privateOwnerId) throw invalid("A personal project stays with its owner.");
  if (input.clientId !== undefined && input.clientId !== before.clientId) throw invalid("A project can't move to another client.");
  await assertAccountManager(input.accountManagerId);
  const kind = input.kind ?? before.kind;
  const postCount = kind === "SOCIAL_MEDIA" ? (input.postCount ?? before.postCount) : before.postCount;
  if (kind === "SOCIAL_MEDIA" && !postCount) throw invalid("How many posts? A social media project needs the number of posts.");
  const p = await db.$transaction(async (tx) => {
    const updated = await tx.project.update({
      where: { id },
      data: { ...input, postCount, startDate: d(input.startDate), targetDate: d(input.targetDate) },
    });
    if (kind === "SOCIAL_MEDIA") await syncPostSlots(tx, id, postCount!);
    return updated;
  });
  if (input.accountManagerId && input.accountManagerId !== before.accountManagerId) {
    await notify(db, [input.accountManagerId], { type: "project.assigned", title: `You now manage ${p.name}`, link: `/projects/${p.id}` }, actor.id);
  }
  await audit(actor, input.status === "ARCHIVED" ? "project.archive" : "project.update", "Project", id, { before, after: input });
  return p;
}

// ───────────────────────────── permanent delete ─────────────────────────────

/**
 * Deletes projects for good: their tasks (with comments, files, submissions, history), feed posts and images.
 * Files in storage are removed after the database commit. Returns how many tasks were removed.
 */
async function purgeProjects(projectIds: string[], extra?: (tx: Prisma.TransactionClient) => Promise<unknown>) {
  const files: string[] = [];
  const removed = await db.$transaction(async (tx) => {
    const tasks = (await tx.task.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } })).map((t) => t.id);
    files.push(...(await tx.attachment.findMany({ where: { taskId: { in: tasks } }, select: { storageKey: true } })).map((a) => a.storageKey));
    files.push(...(await tx.socialMedia.findMany({ where: { post: { projectId: { in: projectIds } } }, select: { storageKey: true } })).map((m) => m.storageKey));
    // Subtasks point at their parent; untie them first so every task can go in one statement.
    await tx.task.updateMany({ where: { OR: [{ id: { in: tasks } }, { parentId: { in: tasks } }] }, data: { parentId: null } });
    await tx.attachment.deleteMany({ where: { taskId: { in: tasks } } });
    await tx.task.deleteMany({ where: { id: { in: tasks } } });
    await tx.project.deleteMany({ where: { id: { in: projectIds } } }); // posts and their images cascade
    await extra?.(tx);
    return tasks.length;
  }, { timeout: 60_000 });
  for (const key of files) await deleteObject(key);
  return removed;
}

const confirmSchema = z.object({ confirm: z.string() });
const canDelete = (actor: SessionUser) => isAdmin(actor);

export async function deleteProject(actor: SessionUser, id: string, raw: unknown) {
  if (!canDelete(actor)) throw forbidden("Only administrators can delete projects.");
  const p = await db.project.findFirst({ where: { AND: [{ id }, projectScope(actor)] }, include: { client: { select: { name: true } } } });
  if (!p) throw notFound("Project");
  if (confirmSchema.parse(raw).confirm.trim() !== p.name.trim()) throw invalid("Type the project's name exactly to confirm.");
  const tasks = await purgeProjects([p.id]);
  // Personal work leaves no trace in the shared audit log.
  if (!p.privateOwnerId) await audit(actor, "project.delete", "Project", p.id, { before: { name: p.name, client: p.client.name, tasks } });
  return { ok: true, tasks };
}

export async function deleteClient(actor: SessionUser, id: string, raw: unknown) {
  if (!canDelete(actor)) throw forbidden("Only administrators can delete clients.");
  const c = await db.client.findFirst({ where: { AND: [{ id }, clientScope(actor)] }, include: { projects: { select: { id: true } } } });
  if (!c) throw notFound("Client");
  if (confirmSchema.parse(raw).confirm.trim() !== c.name.trim()) throw invalid("Type the client's name exactly to confirm.");
  const tasks = await purgeProjects(c.projects.map((p) => p.id), (tx) => tx.client.delete({ where: { id: c.id } })); // its dashboard login cascades
  if (!c.privateOwnerId) await audit(actor, "client.delete", "Client", c.id, { before: { name: c.name, projects: c.projects.length, tasks } });
  return { ok: true, projects: c.projects.length, tasks };
}

