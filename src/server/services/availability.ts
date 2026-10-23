import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { taskRef } from "@/lib/utils";
import { addDays, companyTz, fmtMin, minutesOfDay, startOfZonedDay, zonedParts, zonedToUtc } from "@/lib/time";

type Tx = Prisma.TransactionClient | typeof db;

export type Conflict =
  | { type: "INACTIVE"; message: string }
  | { type: "NON_WORKING_DAY"; message: string }
  | { type: "OUTSIDE_HOURS"; message: string }
  | { type: "LEAVE"; message: string }
  | { type: "OVERLAP"; message: string; taskId: string; taskNumber: number }
  | { type: "DEPENDENCY"; message: string; taskId: string; taskNumber: number };

export type AvailabilityResult = {
  ok: boolean;
  /** The exact message required by the business when the person is unavailable. */
  message?: string;
  conflicts: Conflict[];
  suggestions: { start: string; end: string }[];
};

type Person = {
  id: string; name: string; isActive: boolean; workDays: number[]; workStartMin: number; workEndMin: number;
};

const LIVE_STATUSES = { notIn: ["CANCELLED", "APPROVED"] as ("CANCELLED" | "APPROVED")[] };

export const unavailableMessage = (name: string) => `${name} is unavailable at the selected time.`;

/** Personal conflicts only (hours, leave, other work) — used for both checks and slot search. */
async function personalConflicts(tx: Tx, person: Person, start: Date, end: Date, excludeTaskId?: string): Promise<Conflict[]> {
  const tz = companyTz();
  const out: Conflict[] = [];
  if (!person.isActive) out.push({ type: "INACTIVE", message: `${person.name}'s account is inactive.` });

  const s = zonedParts(start, tz);
  const e = zonedParts(new Date(end.getTime() - 1), tz);
  const sameDay = s.year === e.year && s.month === e.month && s.day === e.day;
  if (!person.workDays.includes(s.isoWeekday) || (!sameDay && !person.workDays.includes(e.isoWeekday))) {
    out.push({ type: "NON_WORKING_DAY", message: `${person.name} does not work on that day.` });
  }
  const startMin = minutesOfDay(start, tz);
  const endMin = sameDay ? minutesOfDay(end, tz) || 24 * 60 : 24 * 60;
  if (!sameDay || startMin < person.workStartMin || endMin > person.workEndMin) {
    out.push({
      type: "OUTSIDE_HOURS",
      message: `Outside working hours (${fmtMin(person.workStartMin)}–${fmtMin(person.workEndMin)}${sameDay ? "" : ", and a block must stay within one day"}).`,
    });
  }

  const leave = await tx.leave.findFirst({ where: { userId: person.id, startsAt: { lt: end }, endsAt: { gt: start } } });
  if (leave) out.push({ type: "LEAVE", message: `On ${leave.type.toLowerCase()} leave${leave.note ? ` (${leave.note})` : ""}.` });

  const overlaps = await tx.task.findMany({
    where: {
      assigneeId: person.id, archivedAt: null, status: LIVE_STATUSES,
      scheduledStart: { lt: end }, scheduledEnd: { gt: start },
      ...(excludeTaskId ? { id: { not: excludeTaskId } } : {}),
    },
    select: { id: true, number: true, title: true },
    take: 5,
  });
  for (const t of overlaps) {
    out.push({ type: "OVERLAP", message: `Already booked on ${taskRef(t.number)} · ${t.title}.`, taskId: t.id, taskNumber: t.number });
  }
  return out;
}

async function dependencyConflicts(tx: Tx, taskId: string | undefined, start: Date): Promise<Conflict[]> {
  if (!taskId) return [];
  const deps = await tx.taskDependency.findMany({
    where: { taskId, dependsOn: { status: { notIn: ["APPROVED", "CANCELLED"] } } },
    include: { dependsOn: { select: { id: true, number: true, title: true, scheduledEnd: true, dueAt: true } } },
  });
  const out: Conflict[] = [];
  for (const d of deps) {
    const finish = d.dependsOn.scheduledEnd;
    if (finish && finish > start) {
      out.push({
        type: "DEPENDENCY",
        message: `${taskRef(d.dependsOn.number)} (${d.dependsOn.title}) is scheduled to finish after this slot starts.`,
        taskId: d.dependsOn.id, taskNumber: d.dependsOn.number,
      });
    }
  }
  return out;
}

/** Find the next free working slots of the same length, starting from `from`. */
export async function suggestSlots(tx: Tx, person: Person, durationMin: number, from: Date, excludeTaskId?: string, count = 3) {
  const tz = companyTz();
  const out: { start: string; end: string }[] = [];
  if (!person.isActive || durationMin <= 0 || durationMin > person.workEndMin - person.workStartMin) return out;
  const horizonDays = 21;
  const now = new Date();
  const begin = from < now ? now : from;
  const dayStart = startOfZonedDay(begin, tz);

  const [leaves, booked] = await Promise.all([
    tx.leave.findMany({ where: { userId: person.id, endsAt: { gt: dayStart }, startsAt: { lt: addDays(dayStart, horizonDays + 1) } } }),
    tx.task.findMany({
      where: {
        assigneeId: person.id, archivedAt: null, status: LIVE_STATUSES,
        scheduledStart: { lt: addDays(dayStart, horizonDays + 1) }, scheduledEnd: { gt: dayStart },
        ...(excludeTaskId ? { id: { not: excludeTaskId } } : {}),
      },
      select: { scheduledStart: true, scheduledEnd: true },
    }),
  ]);
  const busy = [
    ...leaves.map((l) => [l.startsAt.getTime(), l.endsAt.getTime()] as const),
    ...booked.map((b) => [b.scheduledStart!.getTime(), b.scheduledEnd!.getTime()] as const),
  ];

  for (let d = 0; d <= horizonDays && out.length < count; d++) {
    const day = zonedParts(new Date(addDays(dayStart, d).getTime() + 12 * 3600_000), tz); // noon avoids DST edges
    if (!person.workDays.includes(day.isoWeekday)) continue;
    for (let m = person.workStartMin; m + durationMin <= person.workEndMin && out.length < count; m += 30) {
      const s = zonedToUtc(day.year, day.month, day.day, Math.floor(m / 60), m % 60, tz);
      const e = new Date(s.getTime() + durationMin * 60_000);
      if (s < begin) continue;
      const clash = busy.some(([bs, be]) => bs < e.getTime() && be > s.getTime());
      if (!clash) {
        out.push({ start: s.toISOString(), end: e.toISOString() });
        m += durationMin - 30; // next suggestion after this one
      }
    }
  }
  return out;
}

export async function checkAvailability(
  tx: Tx,
  userId: string,
  start: Date,
  end: Date,
  opts: { excludeTaskId?: string; taskId?: string; withSuggestions?: boolean } = {},
): Promise<AvailabilityResult> {
  if (!(start instanceof Date) || isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    return { ok: false, message: "The end time must be after the start time.", conflicts: [], suggestions: [] };
  }
  const person = await tx.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, isActive: true, workDays: true, workStartMin: true, workEndMin: true },
  });
  if (!person) return { ok: false, message: "Assignee not found.", conflicts: [], suggestions: [] };

  const personal = await personalConflicts(tx, person, start, end, opts.excludeTaskId);
  const deps = await dependencyConflicts(tx, opts.taskId, start);
  const conflicts = [...personal, ...deps];
  if (!conflicts.length) return { ok: true, conflicts: [], suggestions: [] };

  const durationMin = Math.round((end.getTime() - start.getTime()) / 60_000);
  const suggestions = opts.withSuggestions === false ? [] : await suggestSlots(tx, person, durationMin, start, opts.excludeTaskId);
  const message = personal.length ? unavailableMessage(person.name) : deps[0]!.message;
  return { ok: false, message, conflicts, suggestions };
}

/** Serialise scheduling writes per assignee to defeat double-booking races. */
export async function lockPerson(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
}
