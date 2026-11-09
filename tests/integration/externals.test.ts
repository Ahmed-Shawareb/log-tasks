import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { hashPassword, toSessionUser } from "@/server/auth";
import { createClient, createProject } from "@/server/services/clients";
import { createTask, distributeTask, listTasks, planTask } from "@/server/services/tasks";
import { createUser, eligibleAssignees, listPeople } from "@/server/services/org";
import { getFeed, updatePost } from "@/server/services/social";
import { workloadBoard } from "@/server/services/planning";
import { as, EMAILS, expectError } from "../helpers/fixtures";

const day = (n: number) => new Date(Date.UTC(2030, 10, n, 10)).toISOString();

async function setup() {
  const mk = async (role: "ADMIN" | "EXTERNAL", name: string, extra: object = {}) =>
    toSessionUser(await db.user.create({ data: { name, role, email: `${name.toLowerCase().replace(/\W+/g, ".")}.${Date.now()}.${Math.random().toString(36).slice(2, 5)}@log.local`, passwordHash: await hashPassword("Ext-Test-2026"), ...extra }, include: { department: true } }));
  const founder = await mk("ADMIN", "Founder Ext", { canOwnPrivateClients: true });
  const otherAdmin = await mk("ADMIN", "Admin Ext");
  const ext = await mk("EXTERNAL", "Freelance Ext");
  return { founder, otherAdmin, ext, am: await as(EMAILS.am) };
}

describe("externals work for the founder only", () => {
  it("nobody else sees, picks or gives work to an external", async () => {
    const s = await setup();
    await expectError(createTask(s.am, { title: "AM to external", assigneeId: s.ext.id }), "FORBIDDEN", "founder only");
    await expectError(createTask(s.otherAdmin, { title: "Admin to external", assigneeId: s.ext.id }), "FORBIDDEN", "founder only");
    expect((await eligibleAssignees(s.am)).map((u) => u.id)).not.toContain(s.ext.id);
    expect((await listPeople(s.otherAdmin)).map((u) => u.id)).not.toContain(s.ext.id);
    expect((await workloadBoard(s.otherAdmin, { start: day(1), days: 30 })).people.map((p) => p.id)).not.toContain(s.ext.id);
    expect((await eligibleAssignees(s.founder)).map((u) => u.id)).toContain(s.ext.id);
    await expectError(createUser(s.otherAdmin, { name: "New freelancer", email: `nf.${Date.now()}@log.local`, role: "EXTERNAL" }), "FORBIDDEN");
  });

  it("the external plans a finish day on their calendar; the founder sees it and is told", async () => {
    const s = await setup();
    const t = await createTask(s.founder, { title: "Freelance poster", assigneeId: s.ext.id, dueAt: day(12) });
    const r = await planTask(s.ext, t.id, { plannedAt: day(14) });
    expect(r.afterDeadline).toBe(true);
    const seen = (await listTasks(s.founder, { q: "Freelance poster" })).items[0]!;
    expect(seen.plannedAt && new Date(seen.plannedAt).toISOString()).toBe(day(14));
    expect(await db.notification.count({ where: { userId: s.founder.id, type: "task.planned", taskId: t.id } })).toBe(1);
    await expectError(planTask(s.am, t.id, { plannedAt: day(10) }), "NOT_FOUND"); // not theirs to see
  });

  it("on a social media task the external fills the project's grid — and sees no other project", async () => {
    const s = await setup();
    const client = await createClient(s.founder, { name: `Ext feed client ${Date.now()}`, personal: true });
    const project = await createProject(s.founder, { name: "Ext feed", clientId: client.id, kind: "SOCIAL_MEDIA", postCount: 3 });
    const other = await createProject(s.founder, { name: "Ext other", clientId: client.id, kind: "SOCIAL_MEDIA", postCount: 3 });
    await createTask(s.founder, { title: "Place the posts", projectId: project.id, assigneeId: s.ext.id, dueAt: day(20) });
    const feed = await getFeed(s.ext, project.id);
    expect(feed.canEdit).toBe(true);
    await updatePost(s.ext, project.id, feed.posts[0]!.id, { link: "https://instagram.com/p/ext" });
    await expectError(getFeed(s.ext, other.id), "NOT_FOUND");
  });

  it("an external splits a counted task across days: part on one day, the rest on another", async () => {
    const s = await setup();
    const type = await db.taskType.findUniqueOrThrow({ where: { name: "Test videos" } }).catch(() => null)
      ?? await db.taskType.create({ data: { name: `Ext videos ${Date.now()}`, unit: "video", unitPlural: "videos" } });
    const t = await createTask(s.founder, { typeId: type.id, quantity: 10, title: "10 videos for the external", assigneeId: s.ext.id, dueAt: day(25) });
    const a = await distributeTask(s.ext, t.id, { allocations: [{ assigneeId: s.ext.id, quantity: 4, plannedAt: day(13) }] });
    expect(a.remaining).toBe(6);
    expect(a.created[0]!.plannedAt?.toISOString()).toBe(day(13));
    expect(a.created[0]!.assigneeId).toBe(s.ext.id);
    const b = await distributeTask(s.ext, t.id, { allocations: [{ assigneeId: s.ext.id, quantity: 6, plannedAt: day(16) }] });
    expect(b.remaining).toBe(0);
    expect(await db.notification.count({ where: { userId: s.founder.id, type: "task.planned", taskId: t.id } })).toBe(2);
    // ...but they can't hand any of it to someone else.
    await expectError(distributeTask(s.ext, t.id, { allocations: [{ assigneeId: s.founder.id, quantity: 1 }] }), "FORBIDDEN");
  });
});
