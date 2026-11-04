import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createTask, distributeTask, getTaskDetail, listTasks, updateTask } from "@/server/services/tasks";
import { as, EMAILS, expectError } from "../helpers/fixtures";

const type = (name: string) => db.taskType.findUniqueOrThrow({ where: { name } });
const user = (email: string) => db.user.findUniqueOrThrow({ where: { email } });
/** Noon in Cairo on day n of a fixed future month, so day boundaries are unambiguous. */
const day = (n: number) => new Date(Date.UTC(2030, 0, n, 10)).toISOString();
const SCRIPT = 0, FILM = 1, EDIT = 2;

async function thirtyVideos() {
  const admin = await as(EMAILS.admin), am = await as(EMAILS.am);
  const t = await createTask(admin, { typeId: (await type("Videos Social Media")).id, quantity: 30, assigneeId: am.id, dueAt: day(28) });
  return { am, t };
}

describe("staged tasks: every step comes after the one before it", () => {
  it("the four main types exist with their steps in order", async () => {
    const types = await db.taskType.findMany({ where: { stages: { isEmpty: false } }, orderBy: { sortOrder: "asc" } });
    expect(types.map((t) => [t.name, t.stages])).toEqual([
      ["Videos Social Media", ["Script writing", "Filming", "Editing"]],
      ["Statics Social Media", ["Content creation", "Designs"]],
      ["Videos Ads", ["Creative brief", "Scripts", "Filming", "Editing"]],
      ["Statics Ads", ["Creative brief", "Content", "Designs"]],
    ]);
  });

  it("each step has its own count, and a step must be chosen", async () => {
    const { am, t } = await thirtyVideos();
    const emp = await user(EMAILS.emp);
    const row = (await listTasks(am, { assigneeId: am.id, pageSize: 100, plans: "1" })).items.find((i) => i.id === t.id)!;
    expect(row.stageRemaining).toEqual([30, 30, 30]);
    await expectError(distributeTask(am, t.id, { allocations: [{ assigneeId: emp.id, quantity: 5, dueAt: day(5) }] }), "INVALID", "Choose the step");
  });

  it("filming before its scripts is refused; after them it works, counted unit by unit", async () => {
    const { am, t } = await thirtyVideos();
    const emp = await user(EMAILS.emp), prod = await user(EMAILS.prod);
    await expectError(distributeTask(am, t.id, { allocations: [{ assigneeId: prod.id, quantity: 5, stage: FILM, dueAt: day(10) }] }), "INVALID", "Filming for 5 videos is planned by");

    await distributeTask(am, t.id, { allocations: [{ assigneeId: emp.id, quantity: 5, stage: SCRIPT, dueAt: day(9) }] });
    const r = await distributeTask(am, t.id, { allocations: [{ assigneeId: prod.id, quantity: 5, stage: FILM, dueAt: day(10) }] });
    expect(r.stageRemaining).toEqual([25, 25, 30]);
    // A 6th video filmed on the 10th has no script due before then.
    await expectError(distributeTask(am, t.id, { allocations: [{ assigneeId: prod.id, quantity: 1, stage: FILM, dueAt: day(10) }] }), "INVALID", "only 5 have script writing");
    // The same day as its script is fine.
    await distributeTask(am, t.id, { allocations: [{ assigneeId: emp.id, quantity: 3, stage: SCRIPT, dueAt: day(12) }] });
    await distributeTask(am, t.id, { allocations: [{ assigneeId: prod.id, quantity: 3, stage: FILM, dueAt: day(12) }] });

    // Editing can't come before filming the same way.
    await expectError(distributeTask(am, t.id, { allocations: [{ assigneeId: emp.id, quantity: 5, stage: EDIT, dueAt: day(9) }] }), "INVALID", "have filming due");
    await distributeTask(am, t.id, { allocations: [{ assigneeId: emp.id, quantity: 5, stage: EDIT, dueAt: day(11) }] });
    expect((await getTaskDetail(am, t.id)).stageRemaining).toEqual([22, 22, 25]);
  });

  it("moving a script later than its filming is refused", async () => {
    const { am, t } = await thirtyVideos();
    const emp = await user(EMAILS.emp), prod = await user(EMAILS.prod);
    await distributeTask(am, t.id, { allocations: [{ assigneeId: emp.id, quantity: 5, stage: SCRIPT, dueAt: day(9) }] });
    await distributeTask(am, t.id, { allocations: [{ assigneeId: prod.id, quantity: 5, stage: FILM, dueAt: day(10) }] });
    const script = await db.task.findFirstOrThrow({ where: { parentId: t.id, stage: SCRIPT } });
    await expectError(updateTask(am, script.id, { dueAt: day(11), version: script.version }), "INVALID", "planned by 10 Jan");
    expect((await db.task.findUniqueOrThrow({ where: { id: script.id } })).dueAt?.toISOString()).toBe(day(9));
  });

  it("a manager splitting their filming further is held to the same order", async () => {
    const { am, t } = await thirtyVideos();
    const emp = await user(EMAILS.emp), prodUser = await user(EMAILS.prod), laila = await user(EMAILS.laila);
    await distributeTask(am, t.id, { allocations: [{ assigneeId: emp.id, quantity: 5, stage: SCRIPT, dueAt: day(9) }] });
    await distributeTask(am, t.id, { allocations: [{ assigneeId: prodUser.id, quantity: 5, stage: FILM, dueAt: day(12) }] });
    const filming = await db.task.findFirstOrThrow({ where: { parentId: t.id, stage: FILM } });
    expect(filming.title).toBe("5 videos · Filming · Videos Social Media");
    const prod = await as(EMAILS.prod);
    await expectError(distributeTask(prod, filming.id, { allocations: [{ assigneeId: laila.id, quantity: 2, dueAt: day(8) }] }), "INVALID", "have script writing due");
    await distributeTask(prod, filming.id, { allocations: [{ assigneeId: laila.id, quantity: 2, dueAt: day(10) }] });
    const piece = await db.task.findFirstOrThrow({ where: { parentId: filming.id } });
    expect([piece.stage, piece.quantity, piece.title]).toEqual([FILM, 2, "2 videos · Filming · Videos Social Media"]);
  });
});
