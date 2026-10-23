import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { changePassword, createResetToken, destroySession, getUserFromToken, login, resetPasswordWithToken } from "@/server/auth";
import { as, EMAILS, expectError } from "../helpers/fixtures";

const meta = (ip = "10.0.0.1") => ({ ip, userAgent: "vitest" });

describe("authentication", () => {
  it("logs in with valid credentials and resolves the session", async () => {
    const { token, user } = await login(EMAILS.admin, "LOG_Admin_2026!", meta());
    expect(user.role).toBe("ADMIN");
    const me = await getUserFromToken(token);
    expect(me?.email).toBe(EMAILS.admin);
  });

  it("stores only hashed passwords and hashed session tokens", async () => {
    const u = await db.user.findUniqueOrThrow({ where: { email: EMAILS.emp } });
    expect(u.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(u.passwordHash).not.toContain("LOG_Employee_2026!");
    const { token } = await login(EMAILS.emp, "LOG_Employee_2026!", meta());
    expect(await db.session.count({ where: { tokenHash: token } })).toBe(0);
  });

  it("rejects a wrong password with a generic message", async () => {
    await expectError(login(EMAILS.admin, "wrong-password", meta()), "INVALID", "Incorrect email or password.");
    await expectError(login("nobody@log.local", "whatever", meta()), "INVALID", "Incorrect email or password.");
  });

  it("rate-limits repeated failures", async () => {
    const ip = "10.9.9.9";
    for (let i = 0; i < 5; i++) await login(EMAILS.prod, "nope", meta(ip)).catch(() => {});
    await expectError(login(EMAILS.prod, "LOG_Production_2026!", meta(ip)), "RATE_LIMITED");
    await db.loginAttempt.deleteMany({ where: { email: EMAILS.prod } });
  });

  it("logout destroys the session", async () => {
    const { token } = await login(EMAILS.perf, "LOG_Performance_2026!", meta());
    await destroySession(token);
    expect(await getUserFromToken(token)).toBeNull();
  });

  it("unknown or garbage tokens are unauthenticated", async () => {
    expect(await getUserFromToken("not-a-real-token")).toBeNull();
    expect(await getUserFromToken(undefined)).toBeNull();
  });

  it("changes a password (requires current, enforces strength, signs out other sessions)", async () => {
    const actor = await as(EMAILS.am);
    const other = await login(EMAILS.am, "LOG_Account_2026!", meta());
    await expectError(changePassword(actor, "bad-current", "NewPassw0rd!!"), "INVALID", "Current password is incorrect.");
    await expectError(changePassword(actor, "LOG_Account_2026!", "short"), "INVALID");
    await changePassword(actor, "LOG_Account_2026!", "N3w_Account_Pass");
    expect(await getUserFromToken(other.token)).toBeNull();
    await login(EMAILS.am, "N3w_Account_Pass", meta());
    await changePassword(actor, "N3w_Account_Pass", "LOG_Account_2026!"); // restore
  });

  it("reset tokens are single-use and expire", async () => {
    const u = await db.user.findUniqueOrThrow({ where: { email: "rawan@lotsofgrowthgroup.com" } });
    const token = await createResetToken(u.id, null);
    await resetPasswordWithToken(token, "Rawan_Strong_2026");
    await login(u.email, "Rawan_Strong_2026", meta());
    await expectError(resetPasswordWithToken(token, "Another_Pass_2026"), "INVALID");
    const t2 = await createResetToken(u.id, null);
    await db.passwordResetToken.updateMany({ where: { userId: u.id, usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expectError(resetPasswordWithToken(t2, "Another_Pass_2026"), "INVALID");
  });

  it("inactive users cannot sign in", async () => {
    const u = await db.user.findUniqueOrThrow({ where: { email: EMAILS.karim } });
    const token = await createResetToken(u.id, null);
    await resetPasswordWithToken(token, "Karim_Strong_2026");
    await db.user.update({ where: { id: u.id }, data: { isActive: false } });
    await expectError(login(u.email, "Karim_Strong_2026", meta("10.1.1.1")), "INVALID");
    await db.user.update({ where: { id: u.id }, data: { isActive: true } });
  });
});
