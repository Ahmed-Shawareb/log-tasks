import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const taskRef = (n: number) => `LOG-${n}`;

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

export function formatMinutes(min: number | null | undefined) {
  if (!min) return "0h";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
}

/** Percentage that never divides by zero; null means "not enough data". */
export function pct(num: number, den: number): number | null {
  if (!den) return null;
  return Math.round((num / den) * 1000) / 10;
}

export function isOverdue(t: { dueAt: Date | string | null; status: string }, now = new Date()) {
  if (!t.dueAt) return false;
  if (t.status === "APPROVED" || t.status === "CANCELLED") return false;
  return new Date(t.dueAt).getTime() < now.getTime();
}
