import { describe, expect, it } from "vitest";

// Runs against a live server (npm run dev / npm start / a Preview deployment):  LOG_BASE_URL=https://… npm run test:e2e
const BASE = process.env.LOG_BASE_URL ?? "http://localhost:3100";
const PASSWORDS: Record<string, string> = {
  "admin@log.local": "LOG_Admin_2026!",
  "account.manager@log.local": "LOG_Account_2026!",
  "performance.manager@log.local": "LOG_Performance_2026!",
  "production.manager@log.local": "LOG_Production_2026!",
  "employee@log.local": "LOG_Employee_2026!",
};

async function login(email: string) {
  const res = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: PASSWORDS[email] }) });
  expect(res.status).toBe(200);
  const cookie = res.headers.get("set-cookie") ?? "";
  expect(cookie).toMatch(/log_session=/);
  expect(cookie.toLowerCase()).toContain("httponly");
  expect(cookie.toLowerCase()).toContain("samesite=lax");
  return cookie.split(";")[0]!;
}
const get = (path: string, cookie?: string) => fetch(`${BASE}${path}`, { headers: cookie ? { cookie } : {} });

describe("HTTP API", () => {
  it("health check reports the database", async () => {
    const r = await get("/api/health");
    expect(r.status).toBe(200);
    expect((await r.json()).database).toBe("connected");
  });

  it("rejects unauthenticated API access", async () => {
    expect((await get("/api/tasks")).status).toBe(401);
    expect((await get("/api/users")).status).toBe(401);
  });

  it("redirects unauthenticated pages to login", async () => {
    const r = await fetch(`${BASE}/dashboard`, { redirect: "manual" });
    expect([302, 307, 308]).toContain(r.status);
    expect(r.headers.get("location")).toContain("/login");
  });

  it("rejects a wrong password", async () => {
    const r = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "employee@log.local", password: "nope" }) });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("Incorrect email or password.");
  });

  it("each test account signs in and gets its role", async () => {
    for (const email of Object.keys(PASSWORDS)) {
      const cookie = await login(email);
      const me = await (await get("/api/me", cookie)).json();
      expect(me.user.email).toBe(email);
    }
  });

  it("employee sees only own tasks and cannot open others by ID", async () => {
    const emp = await login("employee@log.local");
    const admin = await login("admin@log.local");
    const mine = await (await get("/api/tasks?pageSize=500", emp)).json();
    const meId = (await (await get("/api/me", emp)).json()).user.id;
    expect(mine.items.every((t: { assigneeId: string; creatorId: string }) => t.assigneeId === meId || t.creatorId === meId)).toBe(true);
    const all = await (await get("/api/tasks?pageSize=500", admin)).json();
    const foreign = all.items.find((t: { assigneeId: string | null; creatorId: string }) => t.assigneeId !== meId && t.creatorId !== meId);
    expect((await get(`/api/tasks/${foreign.id}`, emp)).status).toBe(404);
    expect((await get("/api/audit", emp)).status).toBe(403);
    expect((await get("/api/audit", admin)).status).toBe(200);
  });

  it("blocks cross-site state-changing requests", async () => {
    const admin = await login("admin@log.local");
    const r = await fetch(`${BASE}/api/tasks`, { method: "POST", headers: { cookie: admin, "Content-Type": "application/json", Origin: "https://evil.example" }, body: JSON.stringify({ title: "CSRF attempt" }) });
    expect(r.status).toBe(403);
  });

  it("logout ends the session", async () => {
    const cookie = await login("performance.manager@log.local");
    await fetch(`${BASE}/api/auth/logout`, { method: "POST", headers: { cookie } });
    expect((await get("/api/me", cookie)).status).toBe(401);
  });

  it("sends security headers", async () => {
    const r = await get("/login");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("x-frame-options")).toBe("DENY");
  });
});
