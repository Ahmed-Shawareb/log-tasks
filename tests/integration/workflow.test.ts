import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  addDependency, changeStatus, createTask, getTaskDetail, reviewTask, submitWork, updateTask,
} from "@/server/services/tasks";
import { as, EMAILS, expectError } from "../helpers/fixtures";

describe("task workflow end to end", () => {
  it("admin → account manager → department manager → employee → review → resubmit → approve", async () => {
    const admin = await as(EMAILS.admin), am = await as(EMAILS.am), perf = await as(EMAILS.perf), emp = await as(EMAILS.emp);
    const project = await db.project.findFirstOrThrow({ where: { accountManagerId: am.id } });

    // 1. Admin creates the parent request for the AM
    const parent = await createTask(admin, { title: "Q1 growth plan", projectId: project.id, department: "ACCOUNTS", assigneeId: am.id, dueAt: new Date(Date.now() + 14 * 864e5).toISOString() });
    expect(await db.notification.count({ where: { userId: am.id, taskId: parent.id, type: "task.assigned" } })).toBe(1);

    // 2. AM routes a piece to Performance
    const perfPart = await createTask(am, { title: "Q1 paid media", parentId: parent.id, department: "PERFORMANCE", assigneeId: perf.id });
    expect(perfPart.parentId).toBe(parent.id);
    expect(perfPart.projectId).toBe(project.id); // inherited

    // 3. Performance manager breaks it down for the employee
    const work = await createTask(perf, { title: "Q1 audience build", parentId: perfPart.id, assigneeId: emp.id, checklist: ["Lookalikes", "Interests"] });
    expect(work.departmentId).toBe(perfPart.departmentId);
    expect(work.reviewerId).toBe(perf.id);

    // 4. Employee works and submits
    await changeStatus(emp, work.id, { status: "IN_PROGRESS" });
    await submitWork(emp, work.id, { notes: "Audiences ready", links: ["https://example.com/audiences"] });
    // double click → second submit is rejected, not duplicated
    await expectError(submitWork(emp, work.id, { notes: "Audiences ready" }), "INVALID");
    expect(await db.submission.count({ where: { taskId: work.id } })).toBe(1);

    // 5. Changes requested must include a reason
    await expectError(reviewTask(perf, work.id, { decision: "CHANGES_REQUESTED" }), "INVALID");
    await reviewTask(perf, work.id, { decision: "CHANGES_REQUESTED", feedback: "Add a Gulf expats segment please." });
    let d = await getTaskDetail(emp, work.id);
    expect(d.status).toBe("CHANGES_REQUESTED");
    expect(d.submissions[0]!.review!.feedback).toContain("Gulf");

    // 6. Resubmit — revision 2, revision 1 preserved
    await submitWork(emp, work.id, { notes: "Added Gulf expats" });
    d = await getTaskDetail(perf, work.id);
    expect(d.submissions.map((s) => s.revision)).toEqual([2, 1]);
    expect(d.submissions[1]!.notes).toBe("Audiences ready");

    // 7. Parent cannot be approved while children are open
    await changeStatus(perf, perfPart.id, { status: "IN_PROGRESS" }).catch(() => {});
    // 8. Approve
    await reviewTask(perf, work.id, { decision: "APPROVED" });
    d = await getTaskDetail(emp, work.id);
    expect(d.status).toBe("APPROVED");
    expect(d.completedAt).not.toBeNull();
    expect(d.activities.map((a) => a.action)).toEqual(expect.arrayContaining(["task.created", "task.submitted", "task.changes_requested", "task.resubmitted", "task.approved"]));
    expect(await db.notification.count({ where: { userId: emp.id, taskId: work.id, type: "task.approved" } })).toBe(1);
  });

  it("rejects invalid status transitions", async () => {
    const perf = await as(EMAILS.perf), emp = await as(EMAILS.emp);
    const t = await createTask(perf, { title: "Transition rules", assigneeId: emp.id });
    await expectError(changeStatus(emp, t.id, { status: "APPROVED" }), "INVALID");
    await expectError(changeStatus(emp, t.id, { status: "CANCELLED", reason: "nah" }), "INVALID");
    await expectError(changeStatus(perf, t.id, { status: "BLOCKED" }), "INVALID", "reason");
    await changeStatus(perf, t.id, { status: "BLOCKED", reason: "Waiting for client access" });
    expect((await db.task.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("BLOCKED");
  });

  it("parent approval waits for open subtasks", async () => {
    const am = await as(EMAILS.am), admin = await as(EMAILS.admin), perf = await as(EMAILS.perf);
    const parent = await createTask(admin, { title: "Parent gate", department: "ACCOUNTS", assigneeId: am.id });
    await createTask(am, { title: "Open child", parentId: parent.id, department: "PERFORMANCE", assigneeId: perf.id });
    await changeStatus(am, parent.id, { status: "IN_PROGRESS" });
    await submitWork(am, parent.id, { notes: "All done?" });
    await expectError(reviewTask(admin, parent.id, { decision: "APPROVED" }), "INVALID", "subtask");
  });

  it("deadline changes persist and create activity + audit records", async () => {
    const perf = await as(EMAILS.perf), emp = await as(EMAILS.emp);
    const t = await createTask(perf, { title: "Deadline audit", assigneeId: emp.id, dueAt: new Date(Date.now() + 3 * 864e5).toISOString() });
    const next = new Date(Date.now() + 5 * 864e5).toISOString();
    await updateTask(perf, t.id, { dueAt: next });
    const saved = await db.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(saved.dueAt!.toISOString()).toBe(next);
    expect(await db.activity.count({ where: { taskId: t.id, action: "task.due_changed" } })).toBe(1);
    expect(await db.auditLog.count({ where: { entityId: t.id, action: "task.deadline" } })).toBe(1);
    expect(await db.notification.count({ where: { userId: emp.id, taskId: t.id, type: "task.deadline" } })).toBe(1);
  });

  it("reassignment records a hand-off and notifies both people", async () => {
    const perf = await as(EMAILS.perf), emp = await as(EMAILS.emp);
    const nour = await db.user.findUniqueOrThrow({ where: { email: EMAILS.nour } });
    const t = await createTask(perf, { title: "Hand-off me", assigneeId: emp.id });
    await updateTask(perf, t.id, { assigneeId: nour.id, handoffNote: "Emp is on the launch" });
    const handoffs = await db.handoff.findMany({ where: { taskId: t.id }, orderBy: { createdAt: "asc" } });
    expect(handoffs.map((h) => h.toUserId)).toEqual([emp.id, nour.id]);
    expect(handoffs[1]!.note).toBe("Emp is on the launch");
    expect(await db.notification.count({ where: { userId: emp.id, taskId: t.id, type: "task.reassigned" } })).toBe(1);
    expect(await db.notification.count({ where: { userId: nour.id, taskId: t.id, type: "task.assigned" } })).toBe(1);
  });

  it("concurrent edits with a stale version are rejected instead of silently overwriting", async () => {
    const perf = await as(EMAILS.perf);
    const t = await createTask(perf, { title: "Version check" });
    await updateTask(perf, t.id, { version: t.version, title: "First writer" });
    await expectError(updateTask(perf, t.id, { version: t.version, title: "Second writer" }), "CONFLICT");
  });

  it("prevents parent and dependency cycles", async () => {
    const perf = await as(EMAILS.perf);
    const a = await createTask(perf, { title: "Cycle A" });
    const b = await createTask(perf, { title: "Cycle B", parentId: a.id });
    await expectError(updateTask(perf, a.id, { parentId: b.id }), "INVALID", "under itself");
    await addDependency(perf, a.id, b.id);
    await expectError(addDependency(perf, b.id, a.id), "INVALID", "loop");
  });

  it("cannot start work before its dependencies are finished", async () => {
    const perf = await as(EMAILS.perf), emp = await as(EMAILS.emp);
    const first = await createTask(perf, { title: "Dep first", assigneeId: emp.id });
    const second = await createTask(perf, { title: "Dep second", assigneeId: emp.id, dependsOn: [first.id] });
    await expectError(changeStatus(emp, second.id, { status: "IN_PROGRESS" }), "INVALID", "Waiting on");
  });

  it("rejects bad input and unknown references", async () => {
    const perf = await as(EMAILS.perf);
    await expectError(createTask(perf, { title: "" }), "INVALID");
    await expectError(createTask(perf, { title: "Ghost project", projectId: "does-not-exist" }), "INVALID");
    await expectError(createTask(perf, { title: "Ghost assignee", assigneeId: "does-not-exist" }), "INVALID");
  });
});
