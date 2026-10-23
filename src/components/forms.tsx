"use client";
import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/client";
import { WEEKDAYS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button, Input } from "./ui";

/** Range selector shared by reports-style pages. */
export const RANGE_OPTIONS = [
  { key: "today", label: "Today" }, { key: "7d", label: "7 days" }, { key: "30d", label: "30 days" }, { key: "90d", label: "90 days" }, { key: "custom", label: "Custom" },
] as const;
export type RangeKey = (typeof RANGE_OPTIONS)[number]["key"];

export function CopyField({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <Input readOnly value={value} onFocus={(e) => e.currentTarget.select()} aria-label="Link" className="font-mono text-xs" />
      <Button type="button" onClick={async () => {
        try { await navigator.clipboard.writeText(value); setCopied(true); toast.success("Copied"); setTimeout(() => setCopied(false), 1500); }
        catch { toast.error("Copy failed — select the text and copy it manually."); }
      }}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {label}</Button>
    </div>
  );
}

export function WeekdayPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Working days">
      {WEEKDAYS.map((d) => {
        const on = value.includes(d.iso);
        return (
          <button key={d.iso} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== d.iso) : [...value, d.iso].sort())}
            className={cn("h-9 w-12 rounded-lg border text-xs font-medium transition", on ? "border-accent/60 bg-accent-soft text-fg" : "border-line text-muted hover:text-fg")}>
            {d.short}
          </button>
        );
      })}
    </div>
  );
}

export const minToTime = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const timeToMin = (t: string) => { const [h, m] = t.split(":").map(Number); return (h || 0) * 60 + (m || 0); };

/** Fetch JSON with loading + error; refetches when `deps` change. */
export function useFetch<T>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();
    setLoading(true);
    api<T>(url, { signal: ctrl.signal })
      .then((d) => { setData(d); setError(null); })
      .catch((e) => { if (e.name !== "AbortError") setError(e.message); })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, nonce, ...deps]);
  return { data, error, loading, reload: () => setNonce((n) => n + 1), setData };
}

export function ColorSwatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const colors = ["#8b5cf6", "#06b6d4", "#f59e0b", "#10b981", "#ec4899", "#ef4444", "#3b82f6", "#f97316", "#14b8a6", "#a855f7"];
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color">
      {colors.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={c} onClick={() => onChange(c)}
          className={cn("h-7 w-7 rounded-full ring-offset-2 ring-offset-[var(--bg)] transition", value === c && "ring-2 ring-white")} style={{ background: c }} />
      ))}
    </div>
  );
}
