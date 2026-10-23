import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { forbidden, invalid, notFound } from "../errors";
import { audit, activity, notify } from "../audit";
import { clientScope, isAccountManager, isAdmin, projectScope, taskScope, type SessionUser } from "../permissions";

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
  return c;
}

export async function createClient(actor: SessionUser, raw: unknown) {
  if (!canEditClients(actor)) throw forbidden();
  const input = clientSchema.parse(raw);
  const amId = isAccountManager(actor) ? (input.accountManagerId ?? actor.id) : input.accountManagerId;
  if (isAccountManager(actor) && amId !== actor.id) throw forbidden("You can only create clients you manage.");
  await assertAccountManager(amId);
  const c = await db.client.create({ data: { ...input, accountManagerId: amId ?? null } });
  await audit(actor, "client.create", "Client", c.id, { after: { name: c.name } });
  return c;
}

export async function updateClient(actor: SessionUser, id: string, raw: unknown) {
  const before = await db.client.findFirst({ where: { AND: [{ id }, clientScope(actor)] } });
  if (!before) throw notFound("Client");
  if (!isAdmin(actor) && !(isAccountManager(actor) && before.accountManagerId === actor.id)) throw forbidden();
  const input = clientSchema.partial().parse(raw);
  if (input.accountManagerId !== undefined && !isAdmin(actor)) throw forbidden("Only administrators can change a client's account manager.");
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
    where: { AND: [taskScope(actor), { archivedAt: null, projectId: { in: projects.map((p) => p.id) } }] },
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
  if (actor.role === "EMPLOYEE") {
    return { ...p, client: { ...p.client, contactEmail: null, contactPhone: null, contactName: null, notes: null }, notes: null };
  }
  return p;
}

export async function createProject(actor: SessionUser, raw: unknown) {
  if (!canEditClients(actor)) throw forbidden();
  const input = projectSchema.parse(raw);
  const client = await db.client.findFirst({ where: { AND: [{ id: input.clientId }, clientScope(actor)] } });
  if (!client) throw invalid("Client does not exist.");
  const amId = isAccountManager(actor) ? actor.id : (input.accountManagerId ?? client.accountManagerId);
  await assertAccountManager(amId);
  const start = d(input.startDate), target = d(input.targetDate);
  if (start && target && target < start) throw invalid("Target date cannot be before the start date.");
  const p = await db.project.create({
    data: { ...input, accountManagerId: amId ?? null, startDate: start ?? null, targetDate: target ?? null },
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
  await assertAccountManager(input.accountManagerId);
  const p = await db.project.update({
    where: { id },
    data: { ...input, startDate: d(input.startDate), targetDate: d(input.targetDate) },
  });
  if (input.accountManagerId && input.accountManagerId !== before.accountManagerId) {
    await notify(db, [input.accountManagerId], { type: "project.assigned", title: `You now manage ${p.name}`, link: `/projects/${p.id}` }, actor.id);
  }
  await audit(actor, input.status === "ARCHIVED" ? "project.archive" : "project.update", "Project", id, { before, after: input });
  return p;
}
