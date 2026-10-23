"use client";
import { motion } from "motion/react";
import { CalendarClock, CheckSquare, Clock, GitBranch, MessageSquare, Paperclip } from "lucide-react";
import { PRIORITY_META, type PriorityKey } from "@/lib/constants";
import { cn, isOverdue, taskRef } from "@/lib/utils";
import { fmtDate, fmtTime } from "@/lib/client";
import type { TaskItem } from "@/lib/types";
import { Avatar, OverdueBadge, PriorityBadge, StatusBadge } from "../ui";

export function DueLabel({ dueAt, status, className }: { dueAt: string | null; status: string; className?: string }) {
  if (!dueAt) return null;
  const overdue = isOverdue({ dueAt, status });
  const d = new Date(dueAt);
  const days = Math.round((d.getTime() - Date.now()) / 86_400_000);
  const near = !overdue && days <= 1 && status !== "APPROVED" && status !== "CANCELLED";
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px]", overdue ? "text-red-400" : near ? "text-amber-300" : "text-muted", className)} title={d.toLocaleString()}>
      <Clock className="h-3 w-3" /> {fmtDate(d)}
    </span>
  );
}

export function TaskCard({ task, onClick, compact, dragging, showStatus }: { task: TaskItem; onClick?: () => void; compact?: boolean; dragging?: boolean; showStatus?: boolean }) {
  const overdue = isOverdue(task);
  const pcolor = PRIORITY_META[task.priority as PriorityKey]?.color ?? "#64748b";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick?.()}
      className={cn(
        "group relative cursor-pointer overflow-hidden rounded-xl border border-line bg-[color-mix(in_srgb,var(--panel-solid)_82%,transparent)] p-3 text-left shadow-[0_6px_18px_-12px_rgba(0,0,0,.7)] transition-[border-color,box-shadow]",
        "hover:border-line-strong hover:shadow-glow",
        dragging && "rotate-[2deg] scale-[1.03] border-accent shadow-glow",
        overdue && "border-red-500/40",
      )}
    >
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: pcolor }} />
      <div className="flex items-center gap-2 pl-1">
        <span className="font-mono text-[10px] text-muted">{taskRef(task.number)}</span>
        {task.project && (
          <span className="flex min-w-0 items-center gap-1 text-[10px] text-muted">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: task.project.color }} />
            <span className="truncate">{task.project.name}</span>
          </span>
        )}
        <span className="ml-auto"><PriorityBadge priority={task.priority} compact /></span>
      </div>
      <div className="mt-1.5 line-clamp-2 pl-1 text-[13px] font-medium leading-snug text-fg">{task.title}</div>
      {task.parent && !compact && (
        <div className="mt-1 flex items-center gap-1 pl-1 text-[10px] text-muted"><GitBranch className="h-3 w-3" /> <span className="truncate">{task.parent.title}</span></div>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-1">
        {showStatus && <StatusBadge status={task.status} />}
        {overdue && <OverdueBadge />}
        {task.scheduledStart && (
          <span className="inline-flex items-center gap-1 text-[11px] text-indigo-300"><CalendarClock className="h-3 w-3" />{fmtDate(task.scheduledStart, { weekday: "short" })} {fmtTime(task.scheduledStart)}</span>
        )}
        {!overdue && <DueLabel dueAt={task.dueAt} status={task.status} />}
        <span className="ml-auto flex items-center gap-2 text-[10px] text-muted">
          {task._count.children > 0 && <span className="inline-flex items-center gap-0.5"><CheckSquare className="h-3 w-3" />{task._count.children}</span>}
          {task._count.comments > 0 && <span className="inline-flex items-center gap-0.5"><MessageSquare className="h-3 w-3" />{task._count.comments}</span>}
          {task._count.attachments > 0 && <span className="inline-flex items-center gap-0.5"><Paperclip className="h-3 w-3" />{task._count.attachments}</span>}
          {task.assignee ? <Avatar name={task.assignee.name} color={task.assignee.avatarColor} size={22} /> : <span className="rounded-full border border-dashed border-line-strong px-1.5 py-0.5">Unassigned</span>}
        </span>
      </div>
    </motion.div>
  );
}
