"use client";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, BarChart3, BookOpen, Download, Users } from "lucide-react";
import { DEPARTMENTS } from "@/lib/constants";
import { qs } from "@/lib/client";
import { cn, formatMinutes } from "@/lib/utils";
import { DepartmentBars, StatusBars } from "@/components/charts";
import { RANGE_OPTIONS, useFetch, type RangeKey } from "@/components/forms";
import { Avatar, Button, Card, CardHeader, EmptyState, Input, PageHeader, Select, Skeleton, Tabs } from "@/components/ui";

type PersonRow = {
  id: string; name: string; avatarColor: string; title: string | null; department: { name: string; key: string } | null;
  open: number; overdue: number; completed: number; onTimeRate: number | null; avgRevisions: number | null; changesRequested: number; loggedMinutes: number;
};
type Dash = {
  kpis: { completionRate: number | null; onTimeRate: number | null; completed: number; createdInRange: number; open: number; overdue: number };
  workloadByDepartment: { name: string; color: string; open: number; overdue: number; estimateMin: number }[];
  statusDistribution: { status: string; count: number }[];
};
type SortKey = "name" | "open" | "overdue" | "completed" | "onTimeRate" | "avgRevisions" | "changesRequested" | "loggedMinutes";

const DEFINITIONS = [
  ["Open", "Tasks not Approved or Cancelled and not archived, assigned to the person."],
  ["Overdue", "Open tasks whose deadline is earlier than now. Calculated live, never set by hand."],
  ["Completed", "Tasks approved (completedAt) within the selected range."],
  ["On-time rate", "Of tasks approved in the range that had a deadline, the share approved on or before it. Shown as — when there are none."],
  ["Avg. revisions", "Average number of submissions per approved task in the range (1.0 = approved first time)."],
  ["Changes requested", "Reviews in the range where the reviewer returned this person’s submission."],
  ["Hours logged", "Time entries (timer or manual) recorded in the range."],
  ["Completion rate", "Of tasks created in the range (excluding cancelled), the share already approved."],
];

export function ReportsClient() {
  const [range, setRange] = useState<RangeKey>("30d");
  const [from, setFrom] = useState(new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [dept, setDept] = useState("");
  const [sort, setSort] = useState<{ by: SortKey; dir: 1 | -1 }>({ by: "open", dir: -1 });
  const rq = qs({ range, from: range === "custom" ? from : undefined, to: range === "custom" ? to : undefined });
  const people = useFetch<PersonRow[]>(`/api/analytics${rq}${rq ? "&" : "?"}kind=people`);
  const dash = useFetch<Dash>(`/api/analytics${rq}`);

  const rows = useMemo(() => {
    const list = (people.data ?? []).filter((p) => !dept || p.department?.key === dept);
    return [...list].sort((a, b) => {
      const av = a[sort.by] ?? -1, bv = b[sort.by] ?? -1;
      return (typeof av === "string" ? av.localeCompare(String(bv)) : (av as number) - (bv as number)) * sort.dir;
    });
  }, [people.data, dept, sort]);

  const Th = ({ by, children, right }: { by: SortKey; children: React.ReactNode; right?: boolean }) => (
    <th className={cn("px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted", right ? "text-right" : "text-left")}>
      <button className="inline-flex items-center gap-1 hover:text-fg" onClick={() => setSort((s) => ({ by, dir: s.by === by ? (s.dir === 1 ? -1 : 1) : -1 }))}>
        {children}{sort.by === by && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );
  const exportBase = "/api/tasks/export";

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Agency" title="Reports" subtitle="Delivery performance calculated from live task records."
        actions={<>
          <a href={`${exportBase}${qs({ department: dept })}`}><Button size="sm"><Download className="h-4 w-4" /> All tasks CSV</Button></a>
          <a href={`${exportBase}${qs({ overdue: "1", department: dept })}`}><Button size="sm"><Download className="h-4 w-4" /> Overdue CSV</Button></a>
          <a href={`${exportBase}${qs({ status: "APPROVED", department: dept })}`}><Button size="sm"><Download className="h-4 w-4" /> Completed CSV</Button></a>
        </>} />
      <div className="glass flex flex-wrap items-center gap-2 rounded-2xl p-2">
        <Tabs tabs={RANGE_OPTIONS.map((r) => ({ key: r.key, label: r.label }))} value={range} onChange={setRange} />
        {range === "custom" && <>
          <Input type="date" className="h-9 w-auto" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
          <Input type="date" className="h-9 w-auto" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
        </>}
        <Select className="ml-auto h-9 w-auto" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department">
          <option value="">All departments</option>
          {DEPARTMENTS.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}
        </Select>
      </div>

      {dash.data && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["Completion rate", dash.data.kpis.completionRate === null ? "—" : `${dash.data.kpis.completionRate}%`],
            ["On-time rate", dash.data.kpis.onTimeRate === null ? "—" : `${dash.data.kpis.onTimeRate}%`],
            ["Completed in range", dash.data.kpis.completed],
            ["Created in range", dash.data.kpis.createdInRange],
          ].map(([l, v]) => <Card key={String(l)} className="p-4"><div className="text-xs text-muted">{l}</div><div className="mt-2 font-display text-3xl font-bold tabular-nums">{v}</div></Card>)}
        </div>
      )}

      <Card>
        <CardHeader title="People performance" subtitle="Click a column to sort" icon={<Users className="h-4 w-4" />} />
        {people.error && <p className="px-5 py-4 text-sm text-danger">{people.error}</p>}
        {!people.data && !people.error && <div className="space-y-2 p-5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>}
        {people.data && rows.length === 0 && <EmptyState icon={<Users className="h-6 w-6" />} title="No people in scope" />}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-b border-line"><tr>
                <Th by="name">Person</Th><Th by="open" right>Open</Th><Th by="overdue" right>Overdue</Th><Th by="completed" right>Completed</Th>
                <Th by="onTimeRate" right>On-time</Th><Th by="avgRevisions" right>Avg. revisions</Th><Th by="changesRequested" right>Changes req.</Th><Th by="loggedMinutes" right>Hours</Th>
              </tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b border-line hover:bg-panel-hover">
                    <td className="px-3 py-2.5"><span className="inline-flex items-center gap-2"><Avatar name={p.name} color={p.avatarColor} size={26} /><span><span className="block text-fg">{p.name}</span><span className="text-[11px] text-muted">{p.title ?? p.department?.name}</span></span></span></td>
                    <td className="px-3 text-right tabular-nums">{p.open}</td>
                    <td className={cn("px-3 text-right tabular-nums", p.overdue > 0 && "text-red-400")}>{p.overdue}</td>
                    <td className="px-3 text-right tabular-nums">{p.completed}</td>
                    <td className="px-3 text-right tabular-nums">{p.onTimeRate === null ? "—" : `${p.onTimeRate}%`}</td>
                    <td className="px-3 text-right tabular-nums">{p.avgRevisions ?? "—"}</td>
                    <td className="px-3 text-right tabular-nums">{p.changesRequested}</td>
                    <td className="px-3 text-right tabular-nums">{formatMinutes(p.loggedMinutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Open work by department" icon={<BarChart3 className="h-4 w-4" />} />
          <div className="p-5">{dash.data ? <DepartmentBars data={dash.data.workloadByDepartment} /> : <Skeleton className="h-56" />}</div>
        </Card>
        <Card>
          <CardHeader title="Status distribution" icon={<BarChart3 className="h-4 w-4" />} />
          <div className="p-4">{dash.data ? <StatusBars data={dash.data.statusDistribution} /> : <Skeleton className="h-56" />}</div>
        </Card>
      </div>

      <Card>
        <CardHeader title="How metrics are calculated" icon={<BookOpen className="h-4 w-4" />} />
        <dl className="grid gap-x-8 gap-y-3 px-5 py-4 md:grid-cols-2">
          {DEFINITIONS.map(([t, d]) => <div key={t}><dt className="text-sm font-medium text-fg">{t}</dt><dd className="text-xs text-muted">{d}</dd></div>)}
        </dl>
      </Card>
    </div>
  );
}
