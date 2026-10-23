import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createTask } from "@/server/services/tasks";
import { createClient, createProject } from "@/server/services/clients";
import { createTeam } from "@/server/services/org";
import { dashboardData, resolveRange } from "@/server/services/analytics";
import { as, EMAILS, expectError } from "../helpers/fixtures";

describe("data integrity", () => {
  it("the seed can be rerun without duplicating anything", async () => {
    const before = { users: await db.user.count(), tasks: await db.task.count(), teams: await db.teamMember.count(), clients: await db.client.count() };
    const url = process.env.DATABASE_URL!;
    execSync("npx tsx prisma/seed.ts", { env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url, APP_ENV: "test" }, stdio: "pipe" });
    expect({ users: await db.user.count(), tasks: await db.task.count(), teams: await db.teamMember.count(), clients: await db.client.count() }).toEqual(before);
  }, 60_000);

  it("the seed refuses predictable test accounts in production", () => {
    const url = process.env.DATABASE_URL!;
    const out = execSync("npx tsx prisma/seed.ts", { env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url, APP_ENV: "production", NODE_ENV: "production" }, stdio: "pipe" }).toString();
    expect(out).toContain("test accounts and demo data skipped");
  }, 60_000);

  it("validates required fields and references", async () => {
    const admin = await as(EMAILS.admin);
    await expectError(createClient(admin, { name: "" }), "INVALID");
    await expectError(createProject(admin, { name: "No client", clientId: "nope" }), "INVALID");
    await expectError(createTeam(admin, { name: "Bad team", department: "PERFORMANCE", managerId: (await db.user.findUniqueOrThrow({ where: { email: EMAILS.emp } })).id }), "INVALID");
    const perfMember = (await db.user.findUniqueOrThrow({ where: { email: EMAILS.emp } })).id;
    await expectError(createTeam(admin, { name: "Dup team", department: "PERFORMANCE", memberIds: [perfMember, perfMember] }), "INVALID");
  });

  it("dashboard metrics are computed from stored records", async () => {
    const admin = await as(EMAILS.admin);
    const range = resolveRange("30d");
    const before = await dashboardData(admin, range);
    expect(before.kpis.open).toBe(await db.task.count({ where: { archivedAt: null, status: { notIn: ["APPROVED", "CANCELLED"] } } }));
    await createTask(admin, { title: "Metric probe", dueAt: new Date(Date.now() - 3600_000).toISOString() });
    const after = await dashboardData(admin, range);
    expect(after.kpis.open).toBe(before.kpis.open + 1);
    expect(after.kpis.overdue).toBe(before.kpis.overdue + 1);
    expect(after.kpis.createdInRange).toBe(before.kpis.createdInRange + 1);
  });
});
