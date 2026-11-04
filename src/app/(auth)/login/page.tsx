import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/server/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

// Development-only quick sign-in. Never rendered when APP_ENV is production.
const DEV_ACCOUNTS = [
  { role: "Administrator", email: "admin@log.local", password: "LOG_Admin_2026!" },
  { role: "Account Manager", email: "account.manager@log.local", password: "LOG_Account_2026!" },
  { role: "Performance Manager", email: "performance.manager@log.local", password: "LOG_Performance_2026!" },
  { role: "Production Manager", email: "production.manager@log.local", password: "LOG_Production_2026!" },
  { role: "Employee", email: "employee@log.local", password: "LOG_Employee_2026!" },
];

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  const showDev = process.env.APP_ENV === "development" && process.env.NODE_ENV !== "production";
  // Only list test accounts that actually exist (they are gone after `npm run reset-to-roster`).
  const existing = showDev
    ? new Set((await db.user.findMany({ where: { email: { in: DEV_ACCOUNTS.map((a) => a.email) }, isActive: true }, select: { email: true } })).map((u) => u.email))
    : new Set<string>();
  return <LoginForm devAccounts={DEV_ACCOUNTS.filter((a) => existing.has(a.email))} />;
}
