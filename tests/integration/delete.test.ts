import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createClient, createProject, deleteClient, deleteProject } from "@/server/services/clients";
import { addComment, createTask, distributeTask } from "@/server/services/tasks";
import { setPortalLogin } from "@/server/portal";
import { as, EMAILS, expectError } from "../helpers/fixtures";

const day = (n: number) => new Date(Date.UTC(2030, 8, n, 10)).toISOString();

async function clientWithWork() {
  const admin = await as(EMAILS.admin), am = await as(EMAILS.am);
  const client = await createClient(admin, { name: `Delete me ${Date.now()}`, accountManagerId: am.id });
  const project = await createProject(admin, { name: "Doomed feed", clientId: client.id, kind: "SOCIAL_MEDIA", postCount: 3, accountManagerId: am.id });
  const second = await createProject(admin, { name: "Doomed site", clientId: client.id, accountManagerId: am.id });
  const type = await db.taskType.findUniqueOrThrow({ where: { name: "Videos Social Media" } });
  const order = await createTask(admin, { typeId: type.id, quantity: 6, assigneeId: am.id, dueAt: day(20), projectId: project.id });
  const prod = await db.user.findUniqueOrThrow({ where: { email: EMAILS.prod } });
  await distributeTask(am, order.id, { allocations: [{ assigneeId: prod.id, quantity: 3, stage: 0, dueAt: day(5) }] });
  await addComment(admin, order.id, { body: "Kick-off notes" });
  await createTask(admin, { title: "Site copy", projectId: second.id, assigneeId: am.id, dueAt: day(9) });
  await setPortalLogin(admin, client.id, { email: `owner-${client.id}@client.test`, password: "Delete-Test-2026" });
  return { admin, am, client, project, second };
}

describe("deleting clients and projects", () => {
  it("only admins delete, and only after typing the exact name", async () => {
    const s = await clientWithWork();
    await expectError(deleteProject(s.am, s.project.id, { confirm: s.project.name }), "FORBIDDEN");
    await expectError(deleteProject(s.admin, s.project.id, { confirm: "doomed" }), "INVALID", "exactly");
    await expectError(deleteClient(s.admin, s.client.id, {}), "INVALID");
    expect(await db.project.count({ where: { id: s.project.id } })).toBe(1);
  });

  it("a project goes with all its tasks, parts, comments and feed posts — the rest of the client stays", async () => {
    const s = await clientWithWork();
    const r = await deleteProject(s.admin, s.project.id, { confirm: s.project.name });
    expect(r.tasks).toBe(2); // the order and its part
    expect(await db.project.count({ where: { id: s.project.id } })).toBe(0);
    expect(await db.task.count({ where: { projectId: s.project.id } })).toBe(0);
    expect(await db.socialPost.count({ where: { projectId: s.project.id } })).toBe(0);
    expect(await db.project.count({ where: { id: s.second.id } })).toBe(1);
    expect(await db.task.count({ where: { projectId: s.second.id } })).toBe(1);
  });

  it("a client goes with every project, task and its dashboard login", async () => {
    const s = await clientWithWork();
    const r = await deleteClient(s.admin, s.client.id, { confirm: s.client.name });
    expect(r).toMatchObject({ projects: 2, tasks: 3 });
    expect(await db.client.count({ where: { id: s.client.id } })).toBe(0);
    expect(await db.project.count({ where: { clientId: s.client.id } })).toBe(0);
    expect(await db.clientUser.count({ where: { clientId: s.client.id } })).toBe(0);
  });

  it("someone else's personal client can't be deleted — it can't even be found", async () => {
    const founder = await db.user.create({ data: { name: "Founder Delete", email: `founder.del.${Date.now()}@log.local`, role: "ADMIN", passwordHash: "x", canOwnPrivateClients: true }, include: { department: true } });
    const { toSessionUser } = await import("@/server/auth");
    const owner = toSessionUser(founder);
    const secret = await createClient(owner, { name: "Secret to keep", personal: true });
    const otherAdmin = await as(EMAILS.admin);
    await expectError(deleteClient(otherAdmin, secret.id, { confirm: "Secret to keep" }), "NOT_FOUND");
    await deleteClient(owner, secret.id, { confirm: "Secret to keep" });
    expect(await db.client.count({ where: { id: secret.id } })).toBe(0);
  });
});
