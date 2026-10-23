import { db } from "@/lib/db";
import { toSessionUser } from "@/server/auth";
import type { SessionUser } from "@/server/permissions";
import { addDays, startOfZonedDay, zonedParts, zonedToUtc } from "@/lib/time";

export const EMAILS = {
  admin: "admin@log.local",
  am: "account.manager@log.local",
  perf: "performance.manager@log.local",
  prod: "production.manager@log.local",
  emp: "employee@log.local",
  nour: "nour.demo@log.local",
  laila: "laila.demo@log.local",
  karim: "karim.demo@log.local",
};

export async function as(email: string): Promise<SessionUser> {
  const u = await db.user.findUniqueOrThrow({ where: { email }, include: { department: true } });
  return toSessionUser(u);
}

/** A slot on the n-th future working day (Sun–Thu) at hh:mm company time, `minutes` long. */
export function slot(nthWorkDay: number, hh: number, mm = 0, minutes = 60) {
  let d = startOfZonedDay(new Date());
  let found = 0;
  for (let i = 0; i < 60; i++) {
    d = addDays(d, 1);
    const z = zonedParts(new Date(d.getTime() + 12 * 3600_000));
    if ([7, 1, 2, 3, 4].includes(z.isoWeekday)) {
      found++;
      if (found === nthWorkDay) {
        const start = zonedToUtc(z.year, z.month, z.day, hh, mm);
        return { start, end: new Date(start.getTime() + minutes * 60_000) };
      }
    }
  }
  throw new Error("no slot");
}

export async function expectError(p: Promise<unknown>, code: string, msg?: RegExp | string) {
  try {
    await p;
  } catch (e) {
    const err = e as { code?: string; message: string; name?: string; issues?: unknown };
    const got = err.code ?? (err.issues ? "INVALID" : err.name);
    if (got !== code) throw new Error(`Expected ${code}, got ${got}: ${err.message}`);
    if (msg && !(typeof msg === "string" ? err.message.includes(msg) : msg.test(err.message))) throw new Error(`Unexpected message: ${err.message}`);
    return err;
  }
  throw new Error(`Expected ${code} error but the call succeeded`);
}
