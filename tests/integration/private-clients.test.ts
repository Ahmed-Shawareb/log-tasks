import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { hashPassword, toSessionUser } from "@/server/auth";
import { createClient, createProject, getClient, getProject, listClients, listProjects } from "@/server/services/clients";
import { createTask, distributeTask, getTaskDetail, listTasks, updateTask } from "@/server/services/tasks";
import { globalSearch, listAudit, workloadBoard } from "@/server/services/planning";
import { dashboardData, resolveRange } from "@/server/services/analytics";
import { as, EMAILS, expectError } from "../helpers/fixtures";

const day = (n: number) => new Date(Date.UTC(2030, 6, n, 10)).toISOString();

async function user(role: "ADMIN" | "EXTERNAL", name: string, extra: { canOwnPrivateClients?: boolean } = {}) {
  const u = await db.user.create({
    data: { name, role, email: `${name.toLowerCase().replace(/\W+/g, ".")}.${Date.now()}@log.local`, passwordHash: await hashPassword("Private-Test-2026"), ...extra },
    include: { department: true },
  });
  return toSessionUser(u);
}

/** The founder with personal clients, another admin, an outsourced external, plus seeded staff. */
async function setup() {
  const founder = await user("ADMIN", "Founder Private", { canOwnPrivateClients: true });
  const otherAdmin = await user("ADMIN", "Other Admin");
  const external = await user("EXTERNAL", "Outsourced Designer");
  const emp = await as(EMAILS.emp); // Performance employee
  const perfManager = await as(EMAILS.perf); // manages the Performance department
  const am = await as(EMAILS.am);
  const name = `Secret Client ${Date.now()}`;
  const client = await createClient(founder, { name, personal: true });
  const project = await createProject(founder, { name: "Secret campaign", clientId: client.id, accountManagerId: am.id });
  const forExternal = await createTask(founder, { title: "Secret logo for the external", projectId: project.id, assigneeId: external.id, dueAt: day(10) });
  const forEmployee = await createTask(founder, { title: "Secret ads for the employee", projectId: project.id, assigneeId: emp.id, dueAt: day(11) });
  const forAm = await createTask(founder, { title: "Secret brief for the AM", projectId: project.id, assigneeId: am.id, dueAt: day(12) });
  return { founder, otherAdmin, external, emp, perfManager, am, name, client, project, forExternal, forEmployee, forAm };
}

describe("personal (private) clients", () => {
  it("only an account allowed to own personal clients can create one", async () => {
    const otherAdmin = await user("ADMIN", "Plain Admin");
    await expectError(createClient(otherAdmin, { name: "Not allowed", personal: true }), "FORBIDDEN");
  });

  it("the project and its tasks are private to the owner; the owner is always the account manager", async () => {
    const s = await setup();
    expect(s.client.privateOwnerId).toBe(s.founder.id);
    expect(s.project.privateOwnerId).toBe(s.founder.id);
    expect(s.project.accountManagerId).toBe(s.founder.id); // the AM picked in the form is ignored
    expect((await db.task.findUniqueOrThrow({ where: { id: s.forEmployee.id } })).privateOwnerId).toBe(s.founder.id);
    expect((await listClients(s.founder)).map((c) => c.id)).toContain(s.client.id);
    expect((await listTasks(s.founder, { projectId: s.project.id })).total).toBe(3);
  });

  it("other administrators see nothing at all: lists, pages, search, planner, dashboard or audit log", async () => {
    const s = await setup();
    const a = s.otherAdmin;
    expect((await listClients(a)).map((c) => c.id)).not.toContain(s.client.id);
    await expectError(getClient(a, s.client.id), "NOT_FOUND");
    expect((await listProjects(a)).map((p) => p.id)).not.toContain(s.project.id);
    await expectError(getProject(a, s.project.id), "NOT_FOUND");
    expect((await listTasks(a, { q: "Secret", pageSize: 100 })).items).toHaveLength(0);
    await expectError(getTaskDetail(a, s.forExternal.id), "NOT_FOUND");
    const found = await globalSearch(a, "Secret");
    expect([...found.tasks, ...found.projects]).toHaveLength(0);
    const board = await workloadBoard(a, { start: day(1), days: 14 });
    expect(board.tasks.some((t) => t.title.startsWith("Secret"))).toBe(false);
    const dash = await dashboardData(a, resolveRange("30d"));
    expect(JSON.stringify(dash)).not.toContain("Secret");
    const audit = await listAudit(a, { page: 1 });
    expect(JSON.stringify(audit.items)).not.toContain(s.name);
    expect(JSON.stringify(audit.items)).not.toContain("Secret logo");
    // ...and they can't slip work into it by id.
    await expectError(createTask(a, { title: "Sneaking in", projectId: s.project.id }), "INVALID", "Project does not exist");
  });

  it("each assignee sees only their own task — never the client, the project or the other tasks", async () => {
    const s = await setup();
    expect((await listTasks(s.external, { pageSize: 100 })).items.map((t) => t.id)).toEqual([s.forExternal.id]);
    expect(await listProjects(s.external)).toHaveLength(0);
    await expectError(getProject(s.external, s.project.id), "NOT_FOUND");
    await expectError(getTaskDetail(s.external, s.forEmployee.id), "NOT_FOUND");

    const amTasks = (await listTasks(s.am, { projectId: s.project.id, pageSize: 100 })).items.map((t) => t.id);
    expect(amTasks).toEqual([s.forAm.id]);
    await expectError(getClient(s.am, s.client.id), "NOT_FOUND");
  });

  it("a department manager doesn't see private work given to someone in their department", async () => {
    const s = await setup();
    expect((await listTasks(s.perfManager, { q: "Secret", pageSize: 100 })).items).toHaveLength(0);
    await expectError(getTaskDetail(s.perfManager, s.forEmployee.id), "NOT_FOUND");
  });

  it("work split from a private task stays private, and private and LOG work can't be mixed", async () => {
    const s = await setup();
    const parts = await createTask(s.founder, { title: "Secret batch", projectId: s.project.id, assigneeId: s.founder.id, dueAt: day(20), typeId: (await db.taskType.findFirstOrThrow({ where: { name: "Test videos" } }).catch(() => null))?.id });
    expect(parts.privateOwnerId).toBe(s.founder.id);
    const logProject = (await listProjects(s.founder)).find((p) => !p.privateOwnerId);
    if (logProject) {
      await expectError(updateTask(s.founder, s.forExternal.id, { projectId: logProject.id }), "INVALID", "can't be mixed");
    }
    if (parts.quantity) {
      const r = await distributeTask(s.founder, parts.id, { allocations: [{ assigneeId: s.external.id, quantity: 1, dueAt: day(15) }] });
      expect(r.created.every((c) => c.privateOwnerId === s.founder.id)).toBe(true);
    }
  });
});
