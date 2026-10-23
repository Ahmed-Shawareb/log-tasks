// Timezone helpers built on Intl (no extra dependency). All instants are stored in UTC;
// working hours are interpreted in the company timezone (APP_TIMEZONE, default Africa/Cairo).

export const DEFAULT_TZ = "Africa/Cairo";

export function companyTz() {
  return (typeof process !== "undefined" && process.env.APP_TIMEZONE) || DEFAULT_TZ;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

const WD: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function zonedParts(date: Date, tz = companyTz()) {
  const p: Record<string, string> = {};
  for (const part of fmt(tz).formatToParts(date)) p[part.type] = part.value;
  return {
    year: +p.year, month: +p.month, day: +p.day, hour: +p.hour % 24, minute: +p.minute, second: +p.second,
    isoWeekday: WD[p.weekday] ?? 1,
  };
}

/** Offset (ms) of tz from UTC at the given instant. */
function offsetAt(date: Date, tz: string) {
  const z = zonedParts(date, tz);
  const asUtc = Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute, z.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Convert a wall-clock time in tz into a UTC Date. */
export function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, tz = companyTz()) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let ts = guess - offsetAt(new Date(guess), tz);
  ts = guess - offsetAt(new Date(ts), tz); // second pass handles DST edges
  return new Date(ts);
}

export function minutesOfDay(date: Date, tz = companyTz()) {
  const z = zonedParts(date, tz);
  return z.hour * 60 + z.minute;
}

/** Start of the company-local day containing `date`, as a UTC instant. */
export function startOfZonedDay(date: Date, tz = companyTz()) {
  const z = zonedParts(date, tz);
  return zonedToUtc(z.year, z.month, z.day, 0, 0, tz);
}

export function addDays(date: Date, n: number) {
  return new Date(date.getTime() + n * 86_400_000);
}

export function fmtMin(min: number) {
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
