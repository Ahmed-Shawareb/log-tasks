"use client";
// Browser-side API helper: consistent JSON handling and error objects with server-provided details.

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public details?: unknown) {
    super(message);
  }
}

export async function api<T = unknown>(url: string, opts: { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(url, {
    method: opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET"),
    headers: opts.form ? undefined : { "Content-Type": "application/json" },
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    signal: opts.signal,
    credentials: "same-origin",
  });
  if (res.status === 401 && typeof window !== "undefined" && !url.includes("/api/auth/")) {
    window.location.href = "/login";
  }
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data?.code, data?.details);
  return data as T;
}

export type Availability = {
  conflicts: { type: string; message: string }[];
  suggestions: { start: string; end: string }[];
  canUnschedule?: boolean;
};

export const qs = (o: Record<string, string | number | boolean | null | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const fmtDate = (d: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) =>
  d ? new Date(d).toLocaleDateString(undefined, opts) : "—";

export const fmtDateTime = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export const fmtTime = (d: string | Date) => new Date(d).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

export function relative(d: string | Date) {
  const diff = (new Date(d).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return fmtDate(d, { month: "short", day: "numeric", year: "numeric" });
}

/** yyyy-MM-ddTHH:mm for <input type="datetime-local"> in the browser's zone. */
export function toLocalInput(d: string | Date | null | undefined) {
  if (!d) return "";
  const x = new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
}
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);
