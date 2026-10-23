import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createTask, scheduleTask, updateTask } from "@/server/services/tasks";
import { createLeave } from "@/server/services/org";
import { as, EMAILS, expectError, slot } from "../helpers/fixtures";

describe("scheduling & availability", () => {
  it("schedules a task inside working hours and persists it", async () => {
    const perf = await as(EMAILS.perf), emp = await as(EMAILS.emp);
    const t = await createTask(perf, { title: "Schedule me", assigneeId: emp.id });
    const s = slot(3, 10, 0, 90);
    await scheduleTask(perf, t.id, { start: s.start.toISOString(), end: s.end.toISOString() });
    const saved = await db.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(saved.scheduledStart!.getTime()).toBe(s.start.getTime());
    expect(saved.status).toBe("SCHEDULED");
  });

  it("moves a scheduled task", async () => {
    const perf = await as(EMAILS.perf), emp = await as(EMAILS.emp);
    const t = await createTask(perf, { title: "Move me", assigneeId: emp.id });
    const a = slot(4, 9), b = slot(4, 14);
    await scheduleTask(perf, t.id, { start: a.start.toISOString(), end: a.end.toISOString() });
    await scheduleTask(perf, t.id, { start: b.start.toISOString(), end: b.end.toISOString() });
    expect((await db.task.findUniqueOrThrow({ where: { id: t.id } })).scheduledStart!.getTime()).toBe(b.start.getTime());
    expect(await db.activity.count({ where: { taskId: t.id, action: "task.scheduled" } })).toBe(2);
  });

  it("detects overlapping assignments with the exact business message + suggestions", async () => {
    const perf = await as(EMAILS.perf), emp = await as(EMAILS.emp);
    const s = slot(5, 11, 0, 120);
    const t1 = await createTask(perf, { title: "Booked first", assigneeId: emp.id });
    const t2 = await createTask(perf, { title: "Booked second", assigneeId: emp.id });
    await scheduleTask(perf, t1.id, { start: s.start.toISOString(), end: s.end.toISOString() });
    const err = (await expectError(
      scheduleTask(perf, t2.id, { start: new Date(s.start.getTime() + 30 * 60_000).toISOString(), end: new Date(s.end.getTime() + 30 * 60_000).toISOString() }),
      "UNAVAILABLE", "Test Employee is unavailable at the selected time.",
    )) as unknown as { details: { conflicts: { type: string }[]; suggestions: unknown[] } };
    expect(err.details.conflicts.some((c) => c.type === "OVERLAP")).toBe(true);
    expect(err.details.suggestions.length).toBeGreaterThan(0);
    expect((await db.task.findUniqueOrThrow({ where: { id: t2.id } })).scheduledStart).toBeNull(); // nothing persisted
  });

  it("rejects slots outside working hours and on non-working days", async () => {
    const perf = await as(EMAILS.perf), emp = await as(EMAILS.emp);
    const t = await createTask(perf, { title: "Night shift", assigneeId: emp.id });
    const night = slot(6, 21, 0, 60);
    await expectError(scheduleTask(perf, t.id, { start: night.start.toISOString(), end: night.end.toISOString() }), "UNAVAILABLE", "is unavailable at the selected time.");
  });

  it("detects recorded leave", async () => {
    const perf = await as(EMAILS.perf), emp = await as(EMAILS.emp);
    const day = slot(7, 0, 0, 24 * 60);
    await createLeave(perf, { userId: emp.id, type: "SICK", startsAt: day.start.toISOString(), endsAt: day.end.toISOString() });
    const t = await createTask(perf, { title: "During leave", assigneeId: emp.id });
    const s = slot(7, 10);
    const err = (await expectError(scheduleTask(perf, t.id, { start: s.start.toISOString(), end: s.end.toISOString() }), "UNAVAILABLE")) as unknown as { details: { conflicts: { type: string }[] } };
    expect(err.details.conflicts.some((c) => c.type === "LEAVE")).toBe(true);
  });

  it("reassigning a booked task to a busy person is refused unless the slot is released", async () => {
    const perf = await as(EMAILS.perf), emp = await as(EMAILS.emp);
    const nour = await db.user.findUniqueOrThrow({ where: { email: EMAILS.nour } });
    const s = slot(8, 13, 0, 60);
    const mine = await createTask(perf, { title: "Emp booked", assigneeId: emp.id });
    const hers = await createTask(perf, { title: "Nour booked", assigneeId: nour.id });
    await scheduleTask(perf, mine.id, { start: s.start.toISOString(), end: s.end.toISOString() });
    await scheduleTask(perf, hers.id, { start: s.start.toISOString(), end: s.end.toISOString() });
    await expectError(updateTask(perf, mine.id, { assigneeId: nour.id }), "UNAVAILABLE", "Nour Adel (demo) is unavailable at the selected time.");
    expect((await db.task.findUniqueOrThrow({ where: { id: mine.id } })).assigneeId).toBe(emp.id);
    const r = await updateTask(perf, mine.id, { assigneeId: nour.id, onConflict: "unschedule" });
    expect(r.freedSlot).toBe(true);
    const saved = await db.task.findUniqueOrThrow({ where: { id: mine.id } });
    expect(saved.assigneeId).toBe(nour.id);
    expect(saved.scheduledStart).toBeNull();
    expect(saved.dueAt).toEqual(mine.dueAt);
  });

  it("employees can only schedule their own tasks; others get 404", async () => {
    const emp = await as(EMAILS.emp);
    const laila = await db.task.findFirstOrThrow({ where: { title: "Design 8 feed posts" } });
    const s = slot(9, 10);
    await expectError(scheduleTask(emp, laila.id, { start: s.start.toISOString(), end: s.end.toISOString() }), "NOT_FOUND");
  });
});
