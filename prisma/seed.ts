/**
 * LOG seed — safe to re-run (upserts; demo data is only created once).
 *
 *   npm run seed                → reference data + real business identities
 *                                 + (development/test only) the 5 test accounts and synthetic demo data
 *
 * Predictable test credentials are REFUSED when APP_ENV/NODE_ENV is production,
 * unless ALLOW_TEST_ACCOUNTS=true on an explicitly isolated preview/test database.
 */
import { PrismaClient, type Prisma, type Priority, type Role, type TaskStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { DEPARTMENTS } from "../src/lib/constants";
import { addDays, startOfZonedDay, zonedParts, zonedToUtc } from "../src/lib/time";

const db = new PrismaClient();
const appEnv = process.env.APP_ENV ?? process.env.NODE_ENV ?? "development";
const isProd = appEnv === "production" || process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
const allowTestAccounts = !isProd && (["development", "test"].includes(appEnv) || process.env.ALLOW_TEST_ACCOUNTS === "true");

const hash = (pw: string) => bcrypt.hash(pw, 12);
const unusable = () => hash(randomBytes(32).toString("hex"));

const TEST_ACCOUNTS: { email: string; password: string; name: string; role: Role; dept: string; title: string; color: string }[] = [
  { email: "admin@log.local", password: "LOG_Admin_2026!", name: "Test Admin", role: "ADMIN", dept: "MANAGEMENT", title: "Administrator (test)", color: "#e11d48" },
  { email: "account.manager@log.local", password: "LOG_Account_2026!", name: "Test Account Manager", role: "ACCOUNT_MANAGER", dept: "ACCOUNTS", title: "Account Manager (test)", color: "#8b5cf6" },
  { email: "performance.manager@log.local", password: "LOG_Performance_2026!", name: "Test Performance Manager", role: "PERFORMANCE_MANAGER", dept: "PERFORMANCE", title: "Performance Lead (test)", color: "#06b6d4" },
  { email: "production.manager@log.local", password: "LOG_Production_2026!", name: "Test Production Manager", role: "PRODUCTION_MANAGER", dept: "PRODUCTION", title: "Production Lead (test)", color: "#f59e0b" },
  { email: "employee@log.local", password: "LOG_Employee_2026!", name: "Test Employee", role: "EMPLOYEE", dept: "PERFORMANCE", title: "Media Buyer (test)", color: "#22c55e" },
];

/** Synthetic colleagues so team schedules and hand-offs have real people to work with. They cannot log in. */
const DEMO_PEOPLE = [
  { email: "nour.demo@log.local", name: "Nour Adel (demo)", dept: "PERFORMANCE", title: "SEO Specialist", color: "#14b8a6" },
  { email: "youssef.demo@log.local", name: "Youssef Samir (demo)", dept: "PERFORMANCE", title: "Paid Social Specialist", color: "#3b82f6" },
  { email: "laila.demo@log.local", name: "Laila Hany (demo)", dept: "PRODUCTION", title: "Graphic Designer", color: "#ec4899" },
  { email: "karim.demo@log.local", name: "Karim Fathy (demo)", dept: "PRODUCTION", title: "Video Editor", color: "#f97316" },
  { email: "mariam.demo@log.local", name: "Mariam Tarek (demo)", dept: "PRODUCTION", title: "Copywriter", color: "#a855f7" },
];

/** Real business identities. Created without a usable password — activate via an admin reset link or `npm run create-admin`. */
const REAL_PEOPLE: { email: string; name: string; role: Role; dept: string; title: string; color: string }[] = [
  { email: "m.makady@lotsofgrowthgroup.com", name: "Mostafa Makady", role: "ADMIN", dept: "MANAGEMENT", title: "Founder", color: "#c8382a" },
  { email: "o.hassan@lotsofgrowthgroup.com", name: "Omar Hassan", role: "ADMIN", dept: "MANAGEMENT", title: "Managing Partner", color: "#1e4d8f" },
  { email: "rawan@lotsofgrowthgroup.com", name: "Rawan", role: "ACCOUNT_MANAGER", dept: "ACCOUNTS", title: "Account Manager", color: "#7c3aed" },
];

const TEMPLATES = [
  {
    name: "Social Media Campaign", description: "Monthly organic + paid social campaign for a client.", department: null, priority: "HIGH" as Priority,
    checklist: ["Client brief confirmed", "Brand guidelines received", "Reporting KPIs agreed"],
    subtasks: [
      { title: "Content calendar", departmentKey: "PRODUCTION", estimateMinutes: 240, offsetDays: 10 },
      { title: "Design post visuals", departmentKey: "PRODUCTION", estimateMinutes: 480, offsetDays: 6 },
      { title: "Write captions & hashtags", departmentKey: "PRODUCTION", estimateMinutes: 180, offsetDays: 6 },
      { title: "Set up paid campaigns", departmentKey: "PERFORMANCE", estimateMinutes: 240, offsetDays: 3 },
      { title: "Weekly performance report", departmentKey: "PERFORMANCE", estimateMinutes: 120, offsetDays: 0 },
    ],
  },
  {
    name: "Paid Ads Launch", description: "Launch a Meta/Google ads campaign.", department: "PERFORMANCE", priority: "HIGH" as Priority,
    checklist: ["Pixel / tag verified", "Budget approved", "Audiences defined", "UTM parameters set"],
    subtasks: [
      { title: "Audience research", departmentKey: "PERFORMANCE", estimateMinutes: 180, offsetDays: 5 },
      { title: "Ad creatives", departmentKey: "PRODUCTION", estimateMinutes: 360, offsetDays: 3 },
      { title: "Campaign build & QA", departmentKey: "PERFORMANCE", estimateMinutes: 240, offsetDays: 1 },
    ],
  },
  {
    name: "Video Production", description: "Script, shoot, edit and deliver a promotional video.", department: "PRODUCTION", priority: "MEDIUM" as Priority,
    checklist: ["Script approved by client", "Music licensed", "Captions added", "Exports in 9:16, 1:1, 16:9"],
    subtasks: [
      { title: "Script & storyboard", departmentKey: "PRODUCTION", estimateMinutes: 240, offsetDays: 7 },
      { title: "Shoot", departmentKey: "PRODUCTION", estimateMinutes: 480, offsetDays: 4 },
      { title: "Edit & color", departmentKey: "PRODUCTION", estimateMinutes: 600, offsetDays: 1 },
    ],
  },
  {
    name: "Landing Page", description: "Conversion-focused landing page.", department: null, priority: "MEDIUM" as Priority,
    checklist: ["Copy approved", "Mobile tested", "Analytics events firing"],
    subtasks: [
      { title: "Wireframe & copy", departmentKey: "PRODUCTION", estimateMinutes: 300, offsetDays: 6 },
      { title: "Visual design", departmentKey: "PRODUCTION", estimateMinutes: 420, offsetDays: 3 },
      { title: "Tracking & CRO setup", departmentKey: "PERFORMANCE", estimateMinutes: 180, offsetDays: 0 },
    ],
  },
];

async function main() {
  console.log(`[seed] environment: ${appEnv}${isProd ? " (production)" : ""}`);

  // Departments
  const dept: Record<string, string> = {};
  for (const d of DEPARTMENTS) {
    const row = await db.department.upsert({ where: { key: d.key }, create: { key: d.key, name: d.name, color: d.color }, update: { name: d.name, color: d.color } });
    dept[d.key] = row.id;
  }
  await db.setting.upsert({ where: { key: "company" }, create: { key: "company", value: { name: "LOG — Lots of Growth", timezone: process.env.APP_TIMEZONE ?? "Africa/Cairo" } }, update: {} });

  // Real identities — never overwrite an existing account (its role/password may have been changed by an admin).
  for (const p of REAL_PEOPLE) {
    const exists = await db.user.findUnique({ where: { email: p.email } });
    if (!exists) {
      await db.user.create({ data: { email: p.email, name: p.name, role: p.role, departmentId: dept[p.dept], title: p.title, avatarColor: p.color, passwordHash: await unusable() } });
      console.log(`[seed] created ${p.email} (${p.role}) — no password yet; issue a reset link or run npm run create-admin`);
    }
  }

  // Templates
  for (const t of TEMPLATES) {
    const data = { description: t.description, priority: t.priority, departmentId: t.department ? dept[t.department] : null, blueprint: { checklist: t.checklist, subtasks: t.subtasks } };
    await db.taskTemplate.upsert({ where: { name: t.name }, create: { name: t.name, ...data }, update: {} });
  }

  if (!allowTestAccounts) {
    console.log("[seed] test accounts and demo data skipped (production or not explicitly allowed).");
    return;
  }

  // Test accounts — passwords are reset to the documented values on every run.
  const users: Record<string, string> = {};
  for (const a of TEST_ACCOUNTS) {
    const passwordHash = await hash(a.password);
    const u = await db.user.upsert({
      where: { email: a.email },
      create: { email: a.email, name: a.name, role: a.role, departmentId: dept[a.dept], title: a.title, avatarColor: a.color, passwordHash, isTestAccount: true },
      update: { passwordHash, role: a.role, departmentId: dept[a.dept], isActive: true, isTestAccount: true },
    });
    users[a.email] = u.id;
  }
  for (const p of DEMO_PEOPLE) {
    const u = await db.user.upsert({
      where: { email: p.email },
      create: { email: p.email, name: p.name, role: "EMPLOYEE", departmentId: dept[p.dept], title: p.title, avatarColor: p.color, passwordHash: await unusable(), isTestAccount: true },
      update: {},
    });
    users[p.email] = u.id;
  }
  console.log(`[seed] ${TEST_ACCOUNTS.length} test accounts + ${DEMO_PEOPLE.length} demo colleagues ready`);

  // Teams (upsert by unique name, memberships deduplicated by the unique constraint)
  const teams = [
    { name: "Performance Squad", dept: "PERFORMANCE", manager: "performance.manager@log.local", members: ["employee@log.local", "nour.demo@log.local", "youssef.demo@log.local"] },
    { name: "Production Studio", dept: "PRODUCTION", manager: "production.manager@log.local", members: ["laila.demo@log.local", "karim.demo@log.local", "mariam.demo@log.local"] },
  ];
  for (const t of teams) {
    const team = await db.team.upsert({ where: { name: t.name }, create: { name: t.name, departmentId: dept[t.dept]!, managerId: users[t.manager] }, update: {} });
    for (const m of [t.manager, ...t.members]) {
      await db.teamMember.upsert({ where: { teamId_userId: { teamId: team.id, userId: users[m]! } }, create: { teamId: team.id, userId: users[m]! }, update: {} });
    }
  }

  if (await db.client.count({ where: { isDemo: true } })) {
    console.log("[seed] demo data already present — leaving it untouched.");
    return;
  }
  await seedDemo(users, dept);
  console.log("[seed] demo clients, projects and tasks created");
}

async function seedDemo(users: Record<string, string>, dept: Record<string, string>) {
  const U = (e: string) => users[e]!;
  const admin = U("admin@log.local"), am = U("account.manager@log.local"), pm = U("performance.manager@log.local");
  const prm = U("production.manager@log.local"), emp = U("employee@log.local");

  const now = new Date();
  const today = startOfZonedDay(now);
  // Next working day (Sun–Thu) offset n from today, at hh:mm company time.
  const workDay = (n: number, hh = 10, mm = 0) => {
    let d = today, count = 0;
    const step = n >= 0 ? 1 : -1;
    const isWork = (x: Date) => [7, 1, 2, 3, 4].includes(zonedParts(new Date(x.getTime() + 12 * 3600_000)).isoWeekday);
    while (!isWork(d)) d = addDays(d, 1);
    while (count < Math.abs(n)) { d = addDays(d, step); if (isWork(d)) count++; }
    const z = zonedParts(new Date(d.getTime() + 12 * 3600_000));
    return zonedToUtc(z.year, z.month, z.day, hh, mm);
  };

  const clients = await Promise.all([
    db.client.create({ data: { name: "Nile Bites (demo)", contactName: "Hana Fawzy", contactEmail: "hana@nilebites.example", industry: "Food & Beverage", status: "ACTIVE", accountManagerId: am, isDemo: true, notes: "Prefers WhatsApp updates. Monthly retainer." } }),
    db.client.create({ data: { name: "Saqr Motors (demo)", contactName: "Tamer Saqr", contactEmail: "tamer@saqr.example", industry: "Automotive", status: "ACTIVE", accountManagerId: am, isDemo: true } }),
    db.client.create({ data: { name: "Lotus Clinics (demo)", contactName: "Dr. Salma", contactEmail: "salma@lotus.example", industry: "Healthcare", status: "PROSPECT", isDemo: true } }),
  ]);

  const projects = await Promise.all([
    db.project.create({ data: { name: "Ramadan Social Campaign", clientId: clients[0].id, accountManagerId: am, status: "ACTIVE", priority: "HIGH", color: "#8b5cf6", startDate: workDay(-8), targetDate: workDay(12), isDemo: true, description: "Always-on social + paid campaign for the Ramadan season.", requirements: "- 20 posts / month\n- 4 reels\n- Paid budget 150k EGP\n- Weekly reporting" } }),
    db.project.create({ data: { name: "New Model Launch", clientId: clients[1].id, accountManagerId: am, status: "ACTIVE", priority: "URGENT", color: "#06b6d4", startDate: workDay(-3), targetDate: workDay(9), isDemo: true, description: "Launch video + lead-gen ads for the 2027 model.", requirements: "- 60s hero video\n- Lead form campaign\n- Landing page" } }),
    db.project.create({ data: { name: "Brand Refresh", clientId: clients[0].id, accountManagerId: am, status: "PLANNING", priority: "MEDIUM", color: "#f59e0b", startDate: workDay(2), targetDate: workDay(25), isDemo: true } }),
    db.project.create({ data: { name: "Clinic Lead Generation", clientId: clients[2].id, accountManagerId: U("account.manager@log.local"), status: "PLANNING", priority: "LOW", color: "#10b981", targetDate: workDay(30), isDemo: true } }),
  ]);

  type Spec = {
    title: string; project?: number; parent?: string; dept?: string; creator: string; assignee?: string; reviewer?: string;
    status: TaskStatus; priority?: Priority; due?: Date; sched?: [Date, Date]; est?: number; labels?: string[]; checklist?: [string, boolean][];
    desc?: string; completedAt?: Date; createdAt?: Date;
  };
  const created: Record<string, { id: string; number: number }> = {};
  const make = async (key: string, s: Spec) => {
    const t = await db.task.create({
      data: {
        title: s.title, description: s.desc ?? null, projectId: s.project !== undefined ? projects[s.project]!.id : null,
        parentId: s.parent ? created[s.parent]!.id : null, departmentId: s.dept ? dept[s.dept] : null, creatorId: s.creator,
        assigneeId: s.assignee ?? null, reviewerId: s.reviewer ?? null, status: s.status, priority: s.priority ?? "MEDIUM",
        dueAt: s.due ?? null, scheduledStart: s.sched?.[0] ?? null, scheduledEnd: s.sched?.[1] ?? null, estimateMinutes: s.est ?? null,
        labels: s.labels ?? [], completedAt: s.completedAt ?? null, isDemo: true, createdAt: s.createdAt ?? addDays(now, -Math.floor(Math.random() * 20)),
        checklist: s.checklist ? { create: s.checklist.map(([text, done], position) => ({ text, done, position })) } : undefined,
      },
    });
    created[key] = t;
    await db.activity.create({ data: { taskId: t.id, actorId: s.creator, action: "task.created", data: { title: s.title } } });
    if (s.assignee) await db.handoff.create({ data: { taskId: t.id, toUserId: s.assignee, byUserId: s.creator, note: "Initial assignment" } });
    return t;
  };

  // Project 0 — Ramadan campaign (admin → AM → departments → people)
  await make("p0", { title: "Ramadan campaign — full delivery", project: 0, dept: "ACCOUNTS", creator: admin, assignee: am, reviewer: admin, status: "IN_PROGRESS", priority: "HIGH", due: workDay(12, 17), desc: "Client meeting notes: playful tone, family focus, push iftar bundles. Break down into Performance and Production work." });
  await make("p0-perf", { title: "Paid media plan & setup", project: 0, parent: "p0", dept: "PERFORMANCE", creator: am, assignee: pm, reviewer: am, status: "IN_PROGRESS", priority: "HIGH", due: workDay(6, 17) });
  await make("p0-prod", { title: "Creative production — posts & reels", project: 0, parent: "p0", dept: "PRODUCTION", creator: am, assignee: prm, reviewer: am, status: "IN_PROGRESS", priority: "HIGH", due: workDay(8, 17) });
  await make("t1", { title: "Build Meta campaign structure", project: 0, parent: "p0-perf", dept: "PERFORMANCE", creator: pm, assignee: emp, reviewer: pm, status: "IN_PROGRESS", priority: "HIGH", due: workDay(2, 15), sched: [workDay(0, 10), workDay(0, 13)], est: 180, labels: ["meta", "setup"], checklist: [["Create campaign", true], ["Ad sets per audience", true], ["Attach creatives", false], ["Set UTMs", false]] });
  await make("t2", { title: "Audience research: iftar families", project: 0, parent: "p0-perf", dept: "PERFORMANCE", creator: pm, assignee: emp, reviewer: pm, status: "CHANGES_REQUESTED", priority: "MEDIUM", due: workDay(1, 17), est: 120, labels: ["research"] });
  await make("t3", { title: "Competitor ad library audit", project: 0, parent: "p0-perf", dept: "PERFORMANCE", creator: pm, assignee: emp, reviewer: pm, status: "SUBMITTED", priority: "MEDIUM", due: workDay(1, 12), est: 90 });
  await make("t4", { title: "Pixel & conversion API check", project: 0, parent: "p0-perf", dept: "PERFORMANCE", creator: pm, assignee: emp, reviewer: pm, status: "APPROVED", priority: "HIGH", due: workDay(-2, 17), completedAt: workDay(-3, 14), est: 60 });
  await make("t5", { title: "Weekly report #1", project: 0, parent: "p0-perf", dept: "PERFORMANCE", creator: pm, assignee: emp, reviewer: pm, status: "READY", priority: "HIGH", due: workDay(-1, 12), est: 60, labels: ["report"] });
  await make("t6", { title: "Keyword plan for Google Ads", project: 0, parent: "p0-perf", dept: "PERFORMANCE", creator: pm, assignee: U("nour.demo@log.local"), reviewer: pm, status: "SCHEDULED", due: workDay(3, 17), sched: [workDay(1, 9), workDay(1, 12)], est: 180 });
  await make("t7", { title: "Retargeting audiences", project: 0, parent: "p0-perf", dept: "PERFORMANCE", creator: pm, assignee: U("youssef.demo@log.local"), reviewer: pm, status: "BLOCKED", due: workDay(2, 17), est: 120 });
  await make("t8", { title: "Design 8 feed posts", project: 0, parent: "p0-prod", dept: "PRODUCTION", creator: prm, assignee: U("laila.demo@log.local"), reviewer: prm, status: "IN_PROGRESS", priority: "HIGH", due: workDay(3, 17), sched: [workDay(0, 11), workDay(0, 15)], est: 480, labels: ["design"] });
  await make("t9", { title: "Edit 2 reels", project: 0, parent: "p0-prod", dept: "PRODUCTION", creator: prm, assignee: U("karim.demo@log.local"), reviewer: prm, status: "READY", due: workDay(4, 17), est: 360, labels: ["video"] });
  await make("t10", { title: "Captions (AR/EN)", project: 0, parent: "p0-prod", dept: "PRODUCTION", creator: prm, assignee: U("mariam.demo@log.local"), reviewer: prm, status: "SUBMITTED", due: workDay(2, 17), est: 180, labels: ["copy"] });
  await make("t11", { title: "Content calendar", project: 0, parent: "p0-prod", dept: "PRODUCTION", creator: prm, assignee: U("mariam.demo@log.local"), reviewer: prm, status: "APPROVED", due: workDay(-4, 17), completedAt: workDay(-4, 12) });

  // Project 1 — launch
  await make("p1", { title: "Model launch — hero video & lead ads", project: 1, dept: "ACCOUNTS", creator: admin, assignee: am, reviewer: admin, status: "READY", priority: "URGENT", due: workDay(9, 17) });
  await make("t12", { title: "Hero video script", project: 1, parent: "p1", dept: "PRODUCTION", creator: am, assignee: U("mariam.demo@log.local"), reviewer: prm, status: "IN_PROGRESS", priority: "URGENT", due: workDay(1, 15), sched: [workDay(1, 10), workDay(1, 13)], est: 180 });
  await make("t13", { title: "Lead form campaign", project: 1, parent: "p1", dept: "PERFORMANCE", creator: am, assignee: emp, reviewer: pm, status: "BACKLOG", priority: "HIGH", due: workDay(5, 17), est: 240 });
  await make("t14", { title: "Shoot day logistics", project: 1, parent: "p1", dept: "PRODUCTION", creator: am, reviewer: prm, status: "BACKLOG", priority: "HIGH", due: workDay(4, 12), est: 120 });
  await make("t15", { title: "Landing page copy", project: 1, parent: "p1", dept: "PRODUCTION", creator: am, reviewer: prm, status: "BACKLOG", due: workDay(6, 17) });

  // Project 2/3 — planning
  await make("t16", { title: "Brand audit workshop prep", project: 2, dept: "ACCOUNTS", creator: am, assignee: am, reviewer: admin, status: "READY", due: workDay(3, 12) });
  await make("t17", { title: "Proposal for clinic lead-gen", project: 3, dept: "ACCOUNTS", creator: admin, assignee: am, reviewer: admin, status: "ON_HOLD", due: workDay(7, 17) });

  // Dependencies: ads need creatives; campaign build depends on audience research.
  await db.taskDependency.create({ data: { taskId: created.t1!.id, dependsOnId: created.t4!.id } });
  await db.taskDependency.create({ data: { taskId: created.t13!.id, dependsOnId: created.t12!.id } });
  await db.taskDependency.create({ data: { taskId: created.t9!.id, dependsOnId: created.t11!.id } });

  // Submission / review history
  const sub = async (key: string, by: string, revision: number, notes: string, links: string[], review?: { by: string; decision: "APPROVED" | "CHANGES_REQUESTED"; feedback?: string }, at = addDays(now, -2)) => {
    const s = await db.submission.create({ data: { taskId: created[key]!.id, submitterId: by, revision, notes, links, createdAt: at } });
    await db.activity.create({ data: { taskId: created[key]!.id, actorId: by, action: revision > 1 ? "task.resubmitted" : "task.submitted", data: { revision }, createdAt: at } });
    if (review) {
      await db.review.create({ data: { submissionId: s.id, reviewerId: review.by, decision: review.decision, feedback: review.feedback, createdAt: new Date(at.getTime() + 3600_000) } });
      await db.activity.create({ data: { taskId: created[key]!.id, actorId: review.by, action: review.decision === "APPROVED" ? "task.approved" : "task.changes_requested", data: { revision, feedback: review.feedback }, createdAt: new Date(at.getTime() + 3600_000) } });
    }
  };
  await sub("t2", emp, 1, "First pass at audience personas.", ["https://docs.google.com/document/d/demo-personas"], { by: pm, decision: "CHANGES_REQUESTED", feedback: "Good start — please add age brackets and the Upper Egypt segment, and attach the source data." });
  await sub("t3", emp, 1, "Audit of 14 competitor ads with notes on hooks and offers.", ["https://www.facebook.com/ads/library/?demo=1"]);
  await sub("t4", emp, 1, "Pixel fires on all key events, CAPI deduplication verified.", [], { by: pm, decision: "APPROVED" }, addDays(now, -4));
  await sub("t10", U("mariam.demo@log.local"), 1, "Captions for all 8 posts in AR and EN.", ["https://docs.google.com/document/d/demo-captions"]);
  await sub("t11", U("mariam.demo@log.local"), 1, "Calendar v1.", [], { by: prm, decision: "CHANGES_REQUESTED", feedback: "Move the reels to Thursdays and add the Eid post." }, addDays(now, -6));
  await sub("t11", U("mariam.demo@log.local"), 2, "Calendar v2 with requested changes.", ["https://docs.google.com/spreadsheets/d/demo-calendar"], { by: prm, decision: "APPROVED" }, addDays(now, -5));

  // Comments, time, leave, notifications
  await db.comment.createMany({ data: [
    { taskId: created.t1!.id, authorId: pm, body: "Use the CBO structure we agreed in the kickoff." },
    { taskId: created.t1!.id, authorId: emp, body: "On it — will share the campaign IDs once live." },
    { taskId: created.t7!.id, authorId: U("youssef.demo@log.local"), body: "**Blocked:** waiting for client to grant Business Manager access." },
  ] });
  await db.timeEntry.createMany({ data: [
    { taskId: created.t1!.id, userId: emp, minutes: 95, note: "Campaign skeleton", startedAt: addDays(now, -1), endedAt: addDays(now, -1) },
    { taskId: created.t3!.id, userId: emp, minutes: 80, startedAt: addDays(now, -2), endedAt: addDays(now, -2) },
    { taskId: created.t4!.id, userId: emp, minutes: 55, startedAt: addDays(now, -4), endedAt: addDays(now, -4) },
  ] });
  await db.leave.create({ data: { userId: U("karim.demo@log.local"), type: "VACATION", startsAt: workDay(1, 0), endsAt: workDay(2, 0), note: "Family event", createdById: prm } });
  await db.notification.createMany({ data: [
    { userId: emp, type: "task.changes_requested", title: "Changes requested: Audience research: iftar families", body: "Test Performance Manager: Good start — please add age brackets…", taskId: created.t2!.id, link: `/tasks/${created.t2!.number}` },
    { userId: emp, type: "task.assigned", title: "New task: Build Meta campaign structure", taskId: created.t1!.id, link: `/tasks/${created.t1!.number}` },
    { userId: pm, type: "task.submitted", title: "Ready for review: Competitor ad library audit", taskId: created.t3!.id, link: `/tasks/${created.t3!.number}` },
    { userId: prm, type: "task.submitted", title: "Ready for review: Captions (AR/EN)", taskId: created.t10!.id, link: `/tasks/${created.t10!.number}` },
  ] });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

export type { Prisma };
