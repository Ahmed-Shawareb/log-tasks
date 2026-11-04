import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { changeStatus, createTask, distributeTask, getTaskDetail, listTasks, reviewTask, submitWork } from "@/server/services/tasks";
import { eligibleAssignees } from "@/server/services/org";
import { as, EMAILS, expectError } from "../helpers/fixtures";

// A plain countable type without steps (the staged types are covered in stages.test.ts).
const videos = () => db.taskType.upsert({ where: { name: "Test videos" }, create: { name: "Test videos", unit: "video", unitPlural: "videos" }, update: {} });
const user = (email: string) => db.user.findUniqueOrThrow({ where: { email }, include: { department: true } });

describe("fixed task types & splitting work", () => {
  it("creating a task creates exactly one task — nothing is added automatically", async () => {
    const admin = await as(EMAILS.admin), am = await as(EMAILS.am);
    const before = await db.task.count();
    const t = await createTask(admin, { typeId: (await videos()).id, quantity: 60, assigneeId: am.id });
    expect(await db.task.count()).toBe(before + 1);
    expect(t.title).toBe("60 videos");
    expect(t.quantity).toBe(60);
  });

  it("a countable type requires a number; a custom task requires a title", async () => {
    const admin = await as(EMAILS.admin);
    await expectError(createTask(admin, { typeId: (await videos()).id }), "INVALID", "How many videos");
    await expectError(createTask(admin, {}), "INVALID", "title");
  });

  it("account manager splits 60 videos between an employee and a team manager", async () => {
    const admin = await as(EMAILS.admin), am = await as(EMAILS.am);
    const emp = await user(EMAILS.emp), prodMgr = await user(EMAILS.prod);
    const parent = await createTask(admin, { typeId: (await videos()).id, quantity: 60, assigneeId: am.id, dueAt: new Date(Date.now() + 10 * 864e5).toISOString() });

    const r = await distributeTask(am, parent.id, { allocations: [{ assigneeId: emp.id, quantity: 8 }, { assigneeId: prodMgr.id, quantity: 20 }] });
    expect(r.remaining).toBe(32);
    const kids = await db.task.findMany({ where: { parentId: parent.id }, orderBy: { quantity: "asc" } });
    expect(kids.map((k) => [k.assigneeId, k.quantity])).toEqual([[emp.id, 8], [prodMgr.id, 20]]);
    // Work lives in the department of whoever does it.
    expect(kids[0]!.departmentId).toBe(emp.departmentId);
    expect(kids[1]!.departmentId).toBe(prodMgr.departmentId);
    expect((await db.task.findUniqueOrThrow({ where: { id: parent.id } })).status).toBe("IN_PROGRESS");

    // Over-allocation is refused.
    await expectError(distributeTask(am, parent.id, { allocations: [{ assigneeId: emp.id, quantity: 33 }] }), "INVALID", "Only 32 videos left");

    // The production manager splits their 20 within their own team only.
    const prod = await as(EMAILS.prod);
    const laila = await user(EMAILS.laila);
    await distributeTask(prod, kids[1]!.id, { allocations: [{ assigneeId: laila.id, quantity: 5 }] });
    await expectError(distributeTask(prod, kids[1]!.id, { allocations: [{ assigneeId: emp.id, quantity: 5 }] }), "FORBIDDEN");

    // The account manager can still follow the parts their managers split further.
    const grandchild = await db.task.findFirstOrThrow({ where: { parent: { id: kids[1]!.id } } });
    await expect(getTaskDetail(am, grandchild.id)).resolves.toBeTruthy();
    const detail = await getTaskDetail(am, parent.id);
    expect([detail.allocated, detail.remaining]).toEqual([28, 32]);
  });

  it("two managers splitting at the same moment can never exceed the total", async () => {
    const admin = await as(EMAILS.admin), am = await as(EMAILS.am);
    const emp = await user(EMAILS.emp), nour = await user(EMAILS.nour);
    const parent = await createTask(admin, { typeId: (await videos()).id, quantity: 10, assigneeId: am.id });
    const results = await Promise.allSettled([
      distributeTask(am, parent.id, { allocations: [{ assigneeId: emp.id, quantity: 7 }] }),
      distributeTask(am, parent.id, { allocations: [{ assigneeId: nour.id, quantity: 7 }] }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const sum = (await db.task.aggregate({ where: { parentId: parent.id }, _sum: { quantity: true } }))._sum.quantity;
    expect(sum).toBe(7);
  });

  it("who can give work to whom", async () => {
    const am = await as(EMAILS.am), perf = await as(EMAILS.perf), admin = await as(EMAILS.admin);
    const adminUser = await user(EMAILS.admin), laila = await user(EMAILS.laila), emp = await user(EMAILS.emp);
    await expectError(createTask(am, { title: "To the boss", assigneeId: adminUser.id }), "FORBIDDEN");
    const direct = await createTask(am, { title: "Straight to an employee", assigneeId: laila.id });
    expect(direct.departmentId).toBe(laila.departmentId);
    await expectError(createTask(perf, { title: "Other team", assigneeId: laila.id }), "FORBIDDEN");
    // Admin can skip the account manager and go straight to an employee.
    const byAdmin = await createTask(admin, { title: "Admin direct", assigneeId: emp.id });
    expect(byAdmin.departmentId).toBe(emp.departmentId);

    const amList = (await eligibleAssignees(am)).map((p) => p.role);
    expect(amList).not.toContain("ADMIN");
    expect(amList).toEqual(expect.arrayContaining(["EMPLOYEE", "PERFORMANCE_MANAGER", "PRODUCTION_MANAGER"]));
    const perfList = await eligibleAssignees(perf);
    expect(perfList.every((p) => p.department?.key === "PERFORMANCE")).toBe(true);
  });

  it("tells the owner when every part is approved", async () => {
    const admin = await as(EMAILS.admin), am = await as(EMAILS.am), emp = await as(EMAILS.emp);
    const parent = await createTask(admin, { typeId: (await videos()).id, quantity: 3, assigneeId: am.id });
    await distributeTask(am, parent.id, { allocations: [{ assigneeId: emp.id, quantity: 3 }] });
    const part = await db.task.findFirstOrThrow({ where: { parentId: parent.id } });
    await changeStatus(emp, part.id, { status: "IN_PROGRESS" });
    await submitWork(emp, part.id, { notes: "3 videos done" });
    await reviewTask(am, part.id, { decision: "APPROVED" });
    expect(await db.notification.count({ where: { userId: am.id, taskId: parent.id, type: "task.parts_done" } })).toBe(1);
  });

  it("the task list reports what is left to give out", async () => {
    const admin = await as(EMAILS.admin), am = await as(EMAILS.am), emp = await user(EMAILS.emp);
    const parent = await createTask(admin, { typeId: (await videos()).id, quantity: 12, assigneeId: am.id, title: "List remaining probe" });
    await distributeTask(am, parent.id, { allocations: [{ assigneeId: emp.id, quantity: 5 }] });
    const { items } = await listTasks(am, { q: "List remaining probe", pageSize: 10 });
    expect(items.find((t) => t.id === parent.id)?.remaining).toBe(7);
  });
});
