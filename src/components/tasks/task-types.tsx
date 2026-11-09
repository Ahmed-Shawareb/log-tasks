"use client";
import { useEffect, useState } from "react";
import { CalendarDays, Camera, ChartLine, ChartPie, Clapperboard, FileText, Image, Megaphone, Palette, PenLine, Sparkles, Target, type LucideIcon, Film, Video, Layers, Mic, Music, Type } from "lucide-react";
import { api } from "@/lib/client";

export type TaskTypeOpt = { id: string; name: string; unit: string | null; unitPlural: string | null; icon: string; color: string; description: string | null; isActive?: boolean; stages?: string[] };

const ICONS: Record<string, LucideIcon> = {
  clapperboard: Clapperboard, image: Image, palette: Palette, "pen-line": PenLine, camera: Camera, megaphone: Megaphone,
  "file-text": FileText, "chart-pie": ChartPie, "calendar-days": CalendarDays, "chart-line": ChartLine, target: Target, sparkles: Sparkles,
  film: Film, video: Video, layers: Layers, mic: Mic, music: Music, "type": Type,
};
export const ICON_NAMES = Object.keys(ICONS);

export function TypeIcon({ icon, className }: { icon?: string | null; className?: string }) {
  const I = ICONS[icon ?? ""] ?? Sparkles;
  return <I className={className} />;
}

/** "60 videos" / "1 video" / null when the task is not countable. */
export function qtyLabel(type: { unit: string | null; unitPlural: string | null } | null | undefined, n: number | null | undefined) {
  if (n === null || n === undefined) return null;
  return `${n} ${(n === 1 ? type?.unit : type?.unitPlural) ?? (n === 1 ? "item" : "items")}`;
}

/** One colour per kind of step, so the same step looks the same everywhere. */
const STEP_COLORS: [RegExp, string][] = [[/brief/i, "#06b6d4"], [/script|content|writing/i, "#8b5cf6"], [/film|shoot|production/i, "#f97316"], [/edit/i, "#3b82f6"], [/design/i, "#ec4899"]];
export const stepColor = (name: string | null | undefined, i = 0) => STEP_COLORS.find(([re]) => re.test(name ?? ""))?.[1] ?? ["#22c55e", "#eab308", "#14b8a6"][i % 3]!;

let cache: Promise<TaskTypeOpt[]> | null = null;
export function useTaskTypes() {
  const [types, setTypes] = useState<TaskTypeOpt[]>([]);
  useEffect(() => {
    cache ??= api<TaskTypeOpt[]>("/api/task-types").catch(() => { cache = null; return []; });
    cache.then(setTypes);
  }, []);
  return types;
}
export const resetTaskTypesCache = () => { cache = null; };
