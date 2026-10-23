import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { changeStatus, createTask, getTaskDetail, listTasks, reviewTask, submitWork, updateTask } from "@/server/services/tasks";
import { createUser, issueResetLink, listPeople } from "@/server/services/org";
import { getClient, listClients } from "@/server/services/clients";
import { listAudit } from "@/server/services/planning";
import { as, EMAILS, expectError } from "../helpers/fixtures";

async function taskByTitle(title: string) {
  return db.task.findFirstOrThrow({ where: { title } });
}

describe("role-based access control (server side)", () => {
  it("employees cannot read or modify another employee's task (404, not 403)", async () => {
    const emp = await as(EMAILS.emp);
    const other = await taskByTitle("Design 8 feed posts"); // assigned to Laila (production)
    await expectError(getTaskDetail(emp, other.id), "NOT_FOUND");
    await expectError(updateTask(emp, other.id, { title: "hijack" }), "NOT_FOUND");
    await expectError(changeStatus(emp, other.id, { status: "IN_PROGRESS" }), "NOT_FOUND");
    const list = await listTasks(emp, { pageSize: 500 });
    expect(list.items.every((t) => t.assigneeId === emp.id || t.creatorId === emp.id)).toBe(true);
  });

  it("employees cannot change ownership or deadlines on their own task", async () => {
    const emp = await as(EMAILS.emp);
    const own = await taskByTitle("Build Meta campaign structure");
    await expectError(updateTask(emp, own.id, { dueAt: new Date().toISOString() }), "FORBIDDEN");
  });

  it("an assignee cannot approve their own submission", async () => {
    const perf = await as(EMAILS.perf);
    const t = await createTask(perf, { title: "Self-review attempt", department: "PERFORMANCE", assigneeId: perf.id });
    await changeStatus(perf, t.id, { status: "IN_PROGRESS" });
    await submitWork(perf, t.id, { notes: "Done by me" });
    await expectError(reviewTask(perf, t.id, { decision: "APPROVED" }), "FORBIDDEN", "your own work");
  });

  it("account managers cannot use administrator user management", async () => {
    const am = await as(EMAILS.am);
    await expectError(createUser(am, { name: "Evil", email: "evil@log.local", role: "ADMIN" }), "FORBIDDEN");
    const someone = await db.user.findUniqueOrThrow({ where: { email: EMAILS.emp } });
    await expectError(issueResetLink(am, someone.id), "FORBIDDEN");
    await expectError(listAudit(am, {}), "FORBIDDEN");
  });

  it("Performance Managers cannot modify Production tasks", async () => {
    const perf = await as(EMAILS.perf);
    const prodTask = await taskByTitle("Edit 2 reels");
    await expectError(updateTask(perf, prodTask.id, { priority: "URGENT" }), "NOT_FOUND");
    await expectError(createTask(perf, { title: "Sneaky", department: "PRODUCTION" }), "FORBIDDEN");
    const laila = await db.user.findUniqueOrThrow({ where: { email: EMAILS.laila } });
    await expectError(createTask(perf, { title: "Sneaky 2", department: "PERFORMANCE", assigneeId: laila.id }), "FORBIDDEN");
  });

  it("Production Managers cannot modify Performance tasks", async () => {
    const prod = await as(EMAILS.prod);
    const perfTask = await taskByTitle("Keyword plan for Google Ads");
    await expectError(updateTask(prod, perfTask.id, { title: "Renamed by prod" }), "NOT_FOUND");
    await expectError(changeStatus(prod, perfTask.id, { status: "ON_HOLD" }), "NOT_FOUND");
  });

  it("employees never see client records", async () => {
    const emp = await as(EMAILS.emp);
    expect(await listClients(emp)).toHaveLength(0);
    const c = await db.client.findFirstOrThrow();
    await expectError(getClient(emp, c.id), "NOT_FOUND");
  });

  it("employees only see themselves in people lists", async () => {
    const emp = await as(EMAILS.emp);
    const people = await listPeople(emp);
    expect(people.map((p) => p.email)).toEqual([EMAILS.emp]);
  });

  it("administrators see company-wide data", async () => {
    const admin = await as(EMAILS.admin);
    const all = await listTasks(admin, { pageSize: 500 });
    expect(all.total).toBe(await db.task.count({ where: { archivedAt: null } }));
    expect((await listClients(admin)).length).toBeGreaterThanOrEqual(3);
    expect((await listAudit(admin, {})).total).toBeGreaterThan(0);
  });

  it("an email address alone never grants admin rights", async () => {
    // The real admin identity is seeded without a usable password; only an explicit role assignment makes an admin.
    const admin = await as(EMAILS.admin);
    const { user } = await createUser(admin, { name: "Look-alike", email: "m.makady+copy@lotsofgrowthgroup.com", role: "EMPLOYEE", department: "PRODUCTION" });
    expect(user.role).toBe("EMPLOYEE");
  });
});
