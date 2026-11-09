import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { toSessionUser, hashPassword } from "@/server/auth";
import { createClient, createProject, getClient, listProjects } from "@/server/services/clients";
import { changeStatus, createTask, listTasks } from "@/server/services/tasks";
import { getFeed, swapPosts, updatePost } from "@/server/services/social";
import { as, EMAILS, expectError } from "../helpers/fixtures";

const day = (n: number) => new Date(Date.UTC(2030, 4, n, 10)).toISOString();

async function person(role: "SOCIAL_MEDIA_SPECIALIST" | "EXTERNAL", name: string) {
  const u = await db.user.create({
    data: { name, email: `${role.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@log.local`, role, passwordHash: await hashPassword("Role-Test-2026") },
    include: { department: true },
  });
  return toSessionUser(u);
}

describe("social media specialist and external roles", () => {
  it("the specialist sees every social media project and its feed, can fill it in, but not other projects", async () => {
    const admin = await as(EMAILS.admin), am = await as(EMAILS.am);
    const sms = await person("SOCIAL_MEDIA_SPECIALIST", "Sara (social)");
    const client = await createClient(admin, { name: `Roles client ${Date.now()}`, accountManagerId: am.id });
    const social = await createProject(admin, { name: "Feed for the specialist", clientId: client.id, kind: "SOCIAL_MEDIA", postCount: 3, accountManagerId: am.id });
    const plain = await createProject(admin, { name: "Plain website project", clientId: client.id, accountManagerId: am.id });
    const visible = (await listProjects(sms)).map((p) => p.id);
    expect(visible).toContain(social.id);
    expect(visible).not.toContain(plain.id);

    const [a, b] = (await getFeed(sms, social.id)).posts;
    expect((await getFeed(sms, social.id)).canEdit).toBe(true);
    await updatePost(sms, social.id, a!.id, { kind: "REEL", link: "https://instagram.com/reel/1", driveLink: "https://drive.google.com/drive/folders/abc" });
    // Drag and drop: the two squares change places, content and all.
    await swapPosts(sms, social.id, a!.id, b!.id);
    const after = (await getFeed(sms, social.id)).posts;
    expect(after.map((p) => [p.position, p.kind])).toEqual([[1, "POST"], [2, "REEL"], [3, "POST"]]);
    expect(after[1]!.driveLink).toBe("https://drive.google.com/drive/folders/abc");

    await expectError(getClient(sms, client.id), "NOT_FOUND"); // no client records
    const t = await createTask(am, { title: "Specialist can follow", projectId: social.id, assigneeId: am.id, dueAt: day(3) });
    expect((await listTasks(sms, { q: "Specialist can follow" })).items.map((i) => i.id)).toEqual([t.id]);
    await expectError(createTask(sms, { title: "Give to someone", assigneeId: am.id }), "FORBIDDEN");
  });

  it("an external works on the tasks given to them exactly like an employee, and sees nothing else", async () => {
    const am = await as(EMAILS.am);
    const founderRow = await db.user.create({ data: { name: "Founder Ext", email: `founder.ext.${Date.now()}@log.local`, role: "ADMIN", passwordHash: "x", canOwnPrivateClients: true }, include: { department: true } });
    const founder = toSessionUser(founderRow);
    const ext = await person("EXTERNAL", "Outsourced editor");
    const t = await createTask(founder, { title: "Outsourced edit", assigneeId: ext.id, dueAt: day(8) });
    expect((await listTasks(ext, { pageSize: 100 })).items.map((i) => i.id)).toEqual([t.id]);
    await changeStatus(ext, t.id, { status: "IN_PROGRESS" });
    expect((await db.task.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("IN_PROGRESS");
    expect(await listProjects(ext)).toHaveLength(0);
    await expectError(createTask(ext, { title: "Delegating", assigneeId: am.id }), "FORBIDDEN");
  });
});
