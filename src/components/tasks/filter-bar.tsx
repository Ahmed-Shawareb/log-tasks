"use client";
import { Filter, Search, X } from "lucide-react";
import { DEPARTMENTS, PRIORITIES, PRIORITY_META, STATUSES, STATUS_META } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Input, Select } from "../ui";
import { useApp } from "../app-context";
import { useEligible, useProjects } from "./pickers";

export type Filters = {
  q?: string; status?: string; priority?: string; assigneeId?: string; department?: string; projectId?: string;
  overdue?: string; mine?: string; archived?: string; needsReview?: string;
};

export function FilterBar({ value, onChange, hide = [], className }: { value: Filters; onChange: (f: Filters) => void; hide?: (keyof Filters)[]; className?: string }) {
  const { isManager } = useApp();
  const projects = useProjects();
  const { people } = useEligible(value.department || null);
  const set = (k: keyof Filters, v: string) => onChange({ ...value, [k]: v || undefined });
  const toggle = (k: keyof Filters) => onChange({ ...value, [k]: value[k] === "1" ? undefined : "1" });
  const active = Object.entries(value).filter(([, v]) => v).length;
  const chip = (on: boolean) => cn("h-10 rounded-xl border px-3 text-xs font-medium transition", on ? "border-accent/60 bg-accent-soft text-fg" : "border-line bg-panel text-muted hover:text-fg");

  return (
    <div className={cn("glass flex flex-wrap items-center gap-2 rounded-2xl p-2", className)}>
      {!hide.includes("q") && (
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input value={value.q ?? ""} onChange={(e) => set("q", e.target.value)} placeholder="Search title, LOG-123, #label" className="pl-9" aria-label="Search tasks" />
        </div>
      )}
      {!hide.includes("status") && (
        <Select className="w-auto min-w-36" value={value.status ?? ""} onChange={(e) => set("status", e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          <option value="BACKLOG,READY,SCHEDULED,IN_PROGRESS,SUBMITTED,CHANGES_REQUESTED,BLOCKED,ON_HOLD">All open</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </Select>
      )}
      {!hide.includes("priority") && (
        <Select className="w-auto min-w-32" value={value.priority ?? ""} onChange={(e) => set("priority", e.target.value)} aria-label="Priority">
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
        </Select>
      )}
      {isManager && !hide.includes("department") && (
        <Select className="w-auto min-w-36" value={value.department ?? ""} onChange={(e) => set("department", e.target.value)} aria-label="Department">
          <option value="">All departments</option>
          {DEPARTMENTS.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}
        </Select>
      )}
      {isManager && !hide.includes("assigneeId") && (
        <Select className="w-auto min-w-36" value={value.assigneeId ?? ""} onChange={(e) => set("assigneeId", e.target.value)} aria-label="Assignee">
          <option value="">Anyone</option>
          <option value="none">Unassigned</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      )}
      {!hide.includes("projectId") && projects.length > 0 && (
        <Select className="w-auto min-w-40" value={value.projectId ?? ""} onChange={(e) => set("projectId", e.target.value)} aria-label="Project">
          <option value="">All projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      )}
      <div className="flex flex-wrap gap-2">
        {!hide.includes("mine") && isManager && <button className={chip(value.mine === "1")} onClick={() => toggle("mine")}>Mine</button>}
        {!hide.includes("overdue") && <button className={chip(value.overdue === "1")} onClick={() => toggle("overdue")}>Overdue</button>}
        {!hide.includes("needsReview") && <button className={chip(value.needsReview === "1")} onClick={() => toggle("needsReview")}>In review</button>}
        {!hide.includes("archived") && isManager && <button className={chip(value.archived === "1")} onClick={() => toggle("archived")}>Archived</button>}
      </div>
      {active > 0 && (
        <button onClick={() => onChange({})} className="inline-flex h-10 items-center gap-1 rounded-xl px-3 text-xs text-muted hover:text-fg">
          <X className="h-3.5 w-3.5" /> Clear <span className="inline-flex items-center gap-0.5 rounded-full bg-accent-soft px-1.5 text-[10px] text-accent-2"><Filter className="h-2.5 w-2.5" />{active}</span>
        </button>
      )}
    </div>
  );
}
