import { describe, expect, it } from "vitest";
import { saveTaskType } from "@/server/services/task-types";
import { createTask, distributeTask } from "@/server/services/tasks";
import { db } from "@/lib/db";
import { as, EMAILS, expectError } from "../helpers/fixtures";

const day = (n: number) => new Date(Date.UTC(2031, 0, n, 10)).toISOString();

describe("admins create their own task types with a counter and steps", () => {
  it("a new counted type works everywhere like the built-in ones", async () => {
    const admin = await as(EMAILS.admin), am = await as(EMAILS.am);
    const name = `Reels ${Date.now()}`;
    const t = await saveTaskType(admin, { name, unit: "reel", stages: ["Script", "Shoot", "Edit"] });
    expect(t.unitPlural).toBe("reels"); // filled in when left empty
    const order = await createTask(admin, { typeId: t.id, quantity: 12, assigneeId: am.id, dueAt: day(20) });
    expect(order.title).toBe("12 reels");
    const prod = await db.user.findUniqueOrThrow({ where: { email: EMAILS.prod } });
    const r = await distributeTask(am, order.id, { allocations: [{ assigneeId: prod.id, quantity: 4, stage: 0, dueAt: day(5) }] });
    expect(r.stageRemaining).toEqual([8, 12, 12]);
  });

  it("steps need a counter, and step names must differ", async () => {
    const admin = await as(EMAILS.admin);
    await expectError(saveTaskType(admin, { name: `Stepped ${Date.now()}`, stages: ["One", "Two"] }), "INVALID", "need a counter");
    await expectError(saveTaskType(admin, { name: `Dupes ${Date.now()}`, unit: "post", stages: ["Design", "design"] }), "INVALID", "different name");
    await expectError(saveTaskType(await as(EMAILS.am), { name: "Not mine" }), "FORBIDDEN");
  });
});
