import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createClient, createProject, updateProject } from "@/server/services/clients";
import { createTask, distributeTask, listTasks } from "@/server/services/tasks";
import { addPostImage, getFeed, readPostImage, updatePost } from "@/server/services/social";
import { portalLogin, setPortalLogin } from "@/server/portal";
import { portalOverview } from "@/server/services/portal-data";
import { workloadBoard } from "@/server/services/planning";
import { hashPassword } from "@/server/auth";
import { as, EMAILS, expectError } from "../helpers/fixtures";

// 1×1 transparent PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const png = (name = "cover.png") => new File([PNG], name, { type: "image/png" });
const day = (n: number) => new Date(Date.UTC(2030, 2, n, 10)).toISOString();
const PW = "Client-Pass-2026";

async function socialProject(posts = 6) {
  const admin = await as(EMAILS.admin), am = await as(EMAILS.am);
  const client = await createClient(admin, { name: `Feed client ${Math.random().toString(36).slice(2, 7)}`, accountManagerId: am.id });
  const project = await createProject(admin, { name: "Monthly content", clientId: client.id, kind: "SOCIAL_MEDIA", postCount: posts, accountManagerId: am.id });
  return { admin, am, client, project };
}

describe("social media projects: the feed grid", () => {
  it("asks how many posts and makes one square per post; the count can change", async () => {
    const { admin, am, client } = await socialProject(6);
    await expectError(createProject(admin, { name: "No count", clientId: client.id, kind: "SOCIAL_MEDIA" }), "INVALID", "How many posts");
    const p = (await db.project.findFirstOrThrow({ where: { clientId: client.id } }));
    expect((await getFeed(am, p.id)).posts.map((x) => x.position)).toEqual([1, 2, 3, 4, 5, 6]);
    await updateProject(admin, p.id, { postCount: 9 });
    expect((await getFeed(am, p.id)).posts).toHaveLength(9);
    const fifth = (await getFeed(am, p.id)).posts[4]!;
    await updatePost(am, p.id, fifth.id, { link: "https://instagram.com/p/abc" });
    await expectError(updateProject(admin, p.id, { postCount: 3 }), "INVALID", "Post 5 already has content");
    await updateProject(admin, p.id, { postCount: 5 });
    expect((await getFeed(am, p.id)).posts).toHaveLength(5);
  });

  it("post, reel and carousel: images in order, a reel needs only a cover and a link", async () => {
    const { am, project } = await socialProject(3);
    const [a, b] = (await getFeed(am, project.id)).posts;
    await updatePost(am, project.id, a!.id, { kind: "REEL", link: "https://www.tiktok.com/@x/video/1" });
    await addPostImage(am, project.id, a!.id, png());
    await addPostImage(am, project.id, a!.id, png("second.png")); // a reel keeps one cover: the new one replaces it
    expect((await getFeed(am, project.id)).posts[0]!.media).toHaveLength(1);

    await updatePost(am, project.id, b!.id, { kind: "CAROUSEL" });
    const m1 = await addPostImage(am, project.id, b!.id, png("1.png"));
    const m2 = await addPostImage(am, project.id, b!.id, png("2.png"));
    await updatePost(am, project.id, b!.id, { order: [m2.id, m1.id] });
    expect((await getFeed(am, project.id)).posts[1]!.media.map((m) => m.id)).toEqual([m2.id, m1.id]);
    await expectError(addPostImage(am, project.id, b!.id, new File([Buffer.from("not an image")], "x.mp4", { type: "video/mp4" })), "INVALID", "add its link");
    await expectError(updatePost(am, project.id, b!.id, { link: "javascript:alert(1)" }), "INVALID");
  });

  it("only the project's account manager (or an admin) edits the feed", async () => {
    const { project } = await socialProject(2);
    const emp = await as(EMAILS.emp);
    const post = (await db.socialPost.findFirstOrThrow({ where: { projectId: project.id } }));
    await expectError(updatePost(emp, project.id, post.id, { caption: "hi" }), "NOT_FOUND");
  });
});

describe("client dashboard", () => {
  it("only an admin sets the login; staff emails and weak passwords are refused", async () => {
    const { admin, am, client } = await socialProject(1);
    await expectError(setPortalLogin(am, client.id, { email: "c@client.test", password: PW }), "FORBIDDEN");
    await expectError(setPortalLogin(admin, client.id, { email: EMAILS.am, password: PW }), "INVALID", "staff");
    await expectError(setPortalLogin(admin, client.id, { email: "weak@client.test", password: "short" }), "INVALID");
    const email = `owner-${client.id}@client.test`;
    await setPortalLogin(admin, client.id, { email, password: PW });
    await expectError(portalLogin(email, "Wrong-Pass-2026", "1.1.1.1"), "INVALID");
    const s = await portalLogin(email.toUpperCase(), PW, "1.1.1.1");
    expect(s.token.length).toBeGreaterThan(20);
    await setPortalLogin(admin, client.id, { isActive: false });
    await expectError(portalLogin(email, PW, "1.1.1.2"), "INVALID");
  });

  it("a client sees only their own feed images and work, never another client's", async () => {
    const mine = await socialProject(2), other = await socialProject(1);
    const post = (await getFeed(mine.am, mine.project.id)).posts[0]!;
    const img = await addPostImage(mine.am, mine.project.id, post.id, png());
    expect((await readPostImage({ clientId: mine.client.id }, img.id)).bytes.length).toBe(PNG.length);
    await expectError(readPostImage({ clientId: other.client.id }, img.id), "NOT_FOUND");
    const outsider = await as(EMAILS.emp);
    await expectError(readPostImage({ staff: outsider }, img.id), "NOT_FOUND");

    const type = await db.taskType.findUniqueOrThrow({ where: { name: "Videos Social Media" } });
    const order = await createTask(mine.admin, { typeId: type.id, quantity: 10, assigneeId: mine.am.id, dueAt: day(28), projectId: mine.project.id });
    const ahmed = await db.user.findUniqueOrThrow({ where: { email: EMAILS.prod } });
    await distributeTask(mine.am, order.id, { allocations: [{ assigneeId: ahmed.id, quantity: 4, stage: 0, dueAt: day(5) }] });
    const o = await portalOverview(mine.client.id);
    expect(o.projects[0]!.posts[0]!.media).toEqual([img.id]);
    expect(o.orders[0]!.steps.map((s) => [s.name, s.planned])).toEqual([["Script writing", 4], ["Filming", 0], ["Editing", 0]]);
    expect(o.items.map((i) => i.step)).toEqual(["Script writing"]);
    expect(JSON.stringify(o)).not.toContain("production.manager"); // no staff details
    expect((await portalOverview(other.client.id)).items).toHaveLength(0);
  });
});

describe("account managers: own team only, and the order is not a task", () => {
  it("the order stays out of work lists and the planner; its steps are the work", async () => {
    const admin = await as(EMAILS.admin), am = await as(EMAILS.am);
    const type = await db.taskType.findUniqueOrThrow({ where: { name: "Statics Social Media" } });
    const order = await createTask(admin, { typeId: type.id, quantity: 6, assigneeId: am.id, dueAt: day(20), title: "Order hidden probe" });
    expect((await listTasks(am, { q: "Order hidden probe" })).items).toHaveLength(0);
    expect((await listTasks(am, { q: "Order hidden probe", plans: "1" })).items).toHaveLength(1);
    const board = await workloadBoard(admin, { start: day(1), days: 14 });
    expect(board.tasks.some((t) => t.id === order.id)).toBe(false);
  });

  it("an Accounts employee works only for their own manager; the AM can be in their own team", async () => {
    const am = await as(EMAILS.am);
    const accounts = await db.department.findUniqueOrThrow({ where: { key: "ACCOUNTS" } });
    const stranger = await db.user.create({ data: { name: "Other team editor", email: `other-${Date.now()}@log.local`, role: "EMPLOYEE", departmentId: accounts.id, passwordHash: await hashPassword(PW) } });
    const t = await createTask(am, { title: "Team rule probe", assigneeId: am.id, dueAt: day(10) });
    await expectError(createTask(am, { title: "Not my team", assigneeId: stranger.id, dueAt: day(10) }), "FORBIDDEN", "not in your team");
    const team = await db.team.create({ data: { name: `AM team ${Date.now()}`, departmentId: accounts.id, managerId: am.id } });
    await db.teamMember.createMany({ data: [{ teamId: team.id, userId: stranger.id }, { teamId: team.id, userId: am.id }] });
    await createTask(am, { title: "Now in my team", assigneeId: stranger.id, dueAt: day(10) });
    const board = await workloadBoard(am, { start: day(1), days: 14 });
    expect(board.people.map((p) => p.id)).toEqual(expect.arrayContaining([am.id, stranger.id]));
    expect(t.assigneeId).toBe(am.id);
  });
});
