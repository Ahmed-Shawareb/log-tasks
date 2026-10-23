"use client";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui";

// FullCalendar touches `window`; render it on the client only.
export const CalendarLoader = dynamic(() => import("./calendar-client").then((m) => m.CalendarClient), {
  ssr: false,
  loading: () => <div className="space-y-4"><Skeleton className="h-12 w-72" /><Skeleton className="h-[640px] w-full rounded-2xl" /></div>,
});
