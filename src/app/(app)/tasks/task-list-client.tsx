"use client";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, ClipboardList, Download, Plus } from "lucide-react";
import { toast } from "sonner";
import { PRIORITIES, PRIORITY_META, STATUSES, STATUS_META } from "@/lib/constants";
import { api, fmtDate, fromLocalInput, qs } from "@/lib/client";
import { cn, isOverdue, taskRef } from "@/lib/utils";
import type { TaskItem } from "@/lib/types";
import { useApp } from "@/components/app-context";
import { FilterBar, type Filters } from "@/components/tasks/filter-bar";
import { AssigneeSelect } from "@/components/tasks/pickers";
import { Avatar, Button, EmptyState, Input, OverdueBadge, PageHeader, PriorityBadge, Select, Skeleton, StatusBadge } from "@/components/ui";

type Sort = "due" | "priority" | "created" | "updated" | "number" | "title" | "status";
const FILTER_KEYS: (keyof Filters)[] = ["q", "status", "priority", "assigneeId", "department", "projectId", "overdue", "mine", "archived", "needsReview"];

export function TaskListClient() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { openTask, isManager, openCreate, dataVersion, invalidate } = useApp();
  const initial = useMemo(() => Object.fromEntries(FILTER_KEYS.map((k) => [k, sp.get(k) ?? undefined])) as Filters, [sp]);
  const [filters, setFilters] = useState<Filters>(initial);
  const [sort, setSort] = useState<{ by: Sort; dir: "asc" | "desc" }>({ by: "due", dir: "asc" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: TaskItem[]; total: number; pageSize: number } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<{ action: string; value: string }>({ action: "", value: "" });
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api<{ items: TaskItem[]; total: number; pageSize: number }>(`/api/tasks${qs({ ...filters, sort: sort.by, dir: sort.dir, page, pageSize: 50 })}`, { signal: ctrl.signal })
        .then(setData).catch((e) => { if (e.name !== "AbortError") toast.error(e.message); });
      router.replace(`${pathname}${qs({ ...filters })}`, { scroll: false });
    }, 200);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [filters, sort, page, dataVersion, pathname, router]);

  const toggleSort = (by: Sort) => setSort((s) => ({ by, dir: s.by === by && s.dir === "asc" ? "desc" : "asc" }));
  const allSelected = !!data?.items.length && data.items.every((t) => selected.has(t.id));
  const runBulk = async () => {
    if (!bulk.action) return;
    setBulkBusy(true);
    try {
      const value = bulk.action === "due" ? fromLocalInput(bulk.value) : bulk.value || null;
      const r = await api<{ succeeded: number; failed: number; results: { ok: boolean; error?: string }[] }>("/api/tasks/bulk", { body: { ids: [...selected], action: bulk.action, value } });
      if (r.failed) toast.warning(`${r.succeeded} updated, ${r.failed} skipped`, { description: r.results.find((x) => !x.ok)?.error });
      else toast.success(`${r.succeeded} task${r.succeeded === 1 ? "" : "s"} updated`);
      setSelected(new Set());
      setBulk({ action: "", value: "" });
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk update failed");
    } finally {
      setBulkBusy(false);
    }
  };

  const Th = ({ by, children, className }: { by?: Sort; children: React.ReactNode; className?: string }) => (
    <th className={cn("px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted", className)}>
      {by ? (
        <button onClick={() => toggleSort(by)} className="inline-flex items-center gap-1 hover:text-fg">
          {children} {sort.by === by && (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
        </button>
      ) : children}
    </th>
  );

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Work" title="Tasks" subtitle={data ? `${data.total} task${data.total === 1 ? "" : "s"} match your filters` : "Loading…"}
        actions={<>
          <a href={`/api/tasks/export${qs({ ...filters })}`}><Button size="sm"><Download className="h-4 w-4" /> Export CSV</Button></a>
          {isManager && <Button variant="primary" size="sm" onClick={() => openCreate()}><Plus className="h-4 w-4" /> New task</Button>}
        </>} />
      <FilterBar value={filters} onChange={(f) => { setFilters(f); setPage(1); }} />

      <AnimatePresence>
        {selected.size > 0 && isManager && (
          <motion.div initial={{ opacity: 0, y: -8, height: 0 }} animate={{ opacity: 1, y: 0, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="glass-strong flex flex-wrap items-center gap-2 rounded-2xl px-4 py-3">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <Select className="h-9 w-auto" value={bulk.action} onChange={(e) => setBulk({ action: e.target.value, value: "" })} aria-label="Bulk action">
              <option value="">Choose action…</option>
              <option value="assign">Hand off to…</option>
              <option value="status">Change status</option>
              <option value="priority">Change priority</option>
              <option value="due">Set deadline</option>
              <option value="archive">Archive</option>
            </Select>
            {bulk.action === "assign" && <div className="w-56"><AssigneeSelect department={filters.department} value={bulk.value} onChange={(v) => setBulk((b) => ({ ...b, value: v }))} /></div>}
            {bulk.action === "status" && <Select className="h-9 w-auto" value={bulk.value} onChange={(e) => setBulk((b) => ({ ...b, value: e.target.value }))}><option value="">Status…</option>{STATUSES.filter((s) => !["SUBMITTED", "APPROVED", "CHANGES_REQUESTED"].includes(s)).map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}</Select>}
            {bulk.action === "priority" && <Select className="h-9 w-auto" value={bulk.value} onChange={(e) => setBulk((b) => ({ ...b, value: e.target.value }))}><option value="">Priority…</option>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}</Select>}
            {bulk.action === "due" && <Input type="datetime-local" className="h-9 w-auto" value={bulk.value} onChange={(e) => setBulk((b) => ({ ...b, value: e.target.value }))} />}
            <Button size="sm" variant="primary" loading={bulkBusy} disabled={!bulk.action || (bulk.action !== "archive" && bulk.action !== "assign" && !bulk.value)} onClick={runBulk}>Apply</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="glass overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-line">
              <tr>
                {isManager && <th className="w-10 px-3"><input type="checkbox" aria-label="Select all" className="accent-violet-500" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(data?.items.map((t) => t.id)))} /></th>}
                <Th by="number">Ref</Th>
                <Th by="title">Task</Th>
                <Th by="status">Status</Th>
                <Th by="priority">Priority</Th>
                <Th>Assignee</Th>
                <Th>Project</Th>
                <Th by="due">Deadline</Th>
              </tr>
            </thead>
            <tbody>
              {!data && Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-line"><td colSpan={8} className="px-3 py-3"><Skeleton className="h-5 w-full" /></td></tr>
              ))}
              {data?.items.map((t, i) => (
                <motion.tr key={t.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.015, 0.3) }}
                  className={cn("cursor-pointer border-b border-line transition-colors hover:bg-panel-hover", selected.has(t.id) && "bg-accent-soft/40")}
                  onClick={() => openTask(t.id)}>
                  {isManager && (
                    <td className="px-3" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label={`Select ${taskRef(t.number)}`} className="accent-violet-500" checked={selected.has(t.id)}
                        onChange={() => setSelected((s) => { const n = new Set(s); n.has(t.id) ? n.delete(t.id) : n.add(t.id); return n; })} />
                    </td>
                  )}
                  <td className="px-3 py-3 font-mono text-xs text-muted">{taskRef(t.number)}</td>
                  <td className="max-w-[340px] px-3 py-3">
                    <div className="truncate font-medium text-fg">{t.title}</div>
                    {t.parent && <div className="truncate text-[11px] text-muted">↳ {t.parent.title}</div>}
                  </td>
                  <td className="px-3 py-3"><StatusBadge status={t.status} /></td>
                  <td className="px-3 py-3"><PriorityBadge priority={t.priority} /></td>
                  <td className="px-3 py-3">{t.assignee ? <span className="inline-flex items-center gap-2"><Avatar name={t.assignee.name} color={t.assignee.avatarColor} size={22} /><span className="truncate text-fg-2">{t.assignee.name}</span></span> : <span className="text-xs text-muted">Unassigned</span>}</td>
                  <td className="max-w-[200px] px-3 py-3">{t.project ? <span className="inline-flex items-center gap-1.5 truncate text-xs text-fg-2"><span className="h-2 w-2 rounded-full" style={{ background: t.project.color }} />{t.project.name}</span> : <span className="text-xs text-muted">—</span>}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs">{isOverdue(t) ? <span className="inline-flex items-center gap-2 text-red-400">{fmtDate(t.dueAt)} <OverdueBadge /></span> : <span className="text-fg-2">{fmtDate(t.dueAt)}</span>}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && data.items.length === 0 && <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="No tasks found" body="Try clearing filters, or create a new task." />}
        {data && data.total > data.pageSize && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-muted">
            <span>Page {page} of {Math.ceil(data.total / data.pageSize)}</span>
            <div className="flex gap-2">
              <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button size="sm" disabled={page * data.pageSize >= data.total} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
