"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import {
  Activity, AlertTriangle, ArrowUpRight, Ban, Briefcase, CalendarClock, CheckCircle2, Clock, Eye, Flame, Gauge, Info,
  ListTodo, RotateCcw, Timer, TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { ROLE_LABEL } from "@/lib/constants";
import { fmtDate, fmtDateTime, fmtTime, qs, relative } from "@/lib/client";
import { cn, formatMinutes, taskRef } from "@/lib/utils";
import { useApp } from "@/components/app-context";
import { DailyChart, DepartmentBars, StatusBars } from "@/components/charts";
import { Avatar, Card, CardHeader, EmptyState, Input, PriorityBadge, Progress, Stagger, StaggerItem, StatusBadge, Tabs } from "@/components/ui";

type Mini = { id: string; number: number; title: string; dueAt: string | null; priority: string; status: string; scheduledStart?: string | null; scheduledEnd?: string | null; project: { name: string; color: string } | null };
type Data = {
  kpis: { open: number; overdue: number; awaitingReview: number; blocked: number; changesRequested: number; inProgress: number; completed: number; activeProjects: number; completionRate: number | null; onTimeRate: number | null; createdInRange: number };
  statusDistribution: { status: string; count: number }[];
  daily: { day: string; created: number; completed: number }[];
  workloadByDepartment: { name: string; color: string; open: number; overdue: number; estimateMin: number }[];
  workloadByPerson: { id: string; name: string; color: string; open: number; overdue: number; inReview: number; scheduledMin: number; capacityMin: number }[];
  upcoming: (Mini & { assignee: { name: string; avatarColor: string } | null })[];
  recentActivity: { id: string; action: string; createdAt: string; actor: { name: string; avatarColor: string } | null; task: { number: number; title: string } | null }[];
  projectProgress: { id: string; name: string; color: string; total: number; done: number; progress: number; client: { name: string }; targetDate: string | null }[];
};
type Mine = { dueToday: Mini[]; upcoming: Mini[]; overdue: Mini[]; returned: Mini[]; inReview: Mini[]; recentlyDone: Mini[]; todaySchedule: Mini[]; minutesThisWeek: number };

function CountUp({ value, suffix = "" }: { value: number | null; suffix?: string }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => (value === null ? "—" : `${Number.isInteger(value) ? Math.round(v) : v.toFixed(1)}${suffix}`));
  useEffect(() => { if (value !== null) { const c = animate(mv, value, { duration: 1.1, ease: [0.22, 1, 0.36, 1] }); return c.stop; } }, [value, mv]);
  return <motion.span>{text}</motion.span>;
}

function Kpi({ label, value, icon: Icon, tone = "#8b5cf6", suffix, help, href }: { label: string; value: number | null; icon: typeof Activity; tone?: string; suffix?: string; help?: string; href?: string }) {
  const body = (
    <Card hover className="group relative h-full overflow-hidden p-4">
      <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-25 blur-2xl transition-opacity group-hover:opacity-45" style={{ background: tone }} />
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-xs font-medium text-muted">{label}{help && <span title={help}><Info className="h-3 w-3" /></span>}</span>
        <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: `color-mix(in srgb, ${tone} 18%, transparent)`, color: tone }}><Icon className="h-4 w-4" /></span>
      </div>
      <div className="mt-3 font-display text-4xl font-bold tabular-nums tracking-tight text-fg"><CountUp value={value} suffix={suffix} /></div>
      {href && <ArrowUpRight className="absolute bottom-3 right-3 h-4 w-4 text-muted opacity-0 transition group-hover:opacity-100" />}
    </Card>
  );
  return <StaggerItem>{href ? <Link href={href} className="block h-full">{body}</Link> : body}</StaggerItem>;
}

function TaskRow({ t, extra }: { t: Mini; extra?: React.ReactNode }) {
  const { openTask } = useApp();
  return (
    <button onClick={() => openTask(t.id)} className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition hover:bg-panel-hover">
      <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: t.project?.color ?? "var(--line-strong)" }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-fg">{t.title}</span>
        <span className="block truncate text-[11px] text-muted">{taskRef(t.number)}{t.project ? ` · ${t.project.name}` : ""}</span>
      </span>
      {extra}
      <PriorityBadge priority={t.priority} compact />
    </button>
  );
}

function List({ items, empty, extra }: { items: Mini[]; empty: string; extra?: (t: Mini) => React.ReactNode }) {
  if (!items.length) return <p className="px-5 py-8 text-center text-xs text-muted">{empty}</p>;
  return <div className="divide-y divide-[var(--line)]">{items.map((t) => <TaskRow key={t.id} t={t} extra={extra?.(t)} />)}</div>;
}

const RANGES = [{ key: "today", label: "Today" }, { key: "7d", label: "7 days" }, { key: "30d", label: "30 days" }, { key: "90d", label: "90 days" }, { key: "custom", label: "Custom" }] as const;

export function DashboardClient({ data, mine, range, denied }: { data: Data; mine: Mine; range: { key: string; from: string; to: string }; denied: boolean }) {
  const { user, isManager } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const [custom, setCustom] = useState({ from: range.from, to: range.to });
  useEffect(() => { if (denied) toast.error("That page is not available for your role."); }, [denied]);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const k = data.kpis;
  const setRange = (key: string) => key !== "custom" ? router.push(`${pathname}${qs({ range: key })}`) : router.push(`${pathname}${qs({ range: "custom", from: custom.from, to: custom.to })}`);

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-2">{ROLE_LABEL[user.role]} dashboard</div>
          <h1 className="font-display text-4xl font-bold tracking-tight md:text-5xl">{greeting}, <span className="text-gradient">{user.name.split(" ")[0]}</span></h1>
          <p className="mt-1 text-sm text-muted">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} · {isManager ? `${k.open} open tasks in your scope` : `${mine.dueToday.length} due today, ${mine.overdue.length} overdue`}</p>
        </div>
        {isManager && (
          <div className="flex flex-wrap items-center gap-2">
            <Tabs tabs={RANGES.map((r) => ({ key: r.key, label: r.label }))} value={range.key as (typeof RANGES)[number]["key"]} onChange={(key) => key === "custom" ? router.push(`${pathname}${qs({ range: "custom", from: custom.from || new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10), to: custom.to || new Date().toISOString().slice(0, 10) })}`) : setRange(key)} />
            {range.key === "custom" && (
              <div className="flex items-center gap-2">
                <Input type="date" className="h-9 w-auto" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} onBlur={() => setRange("custom")} aria-label="From" />
                <Input type="date" className="h-9 w-auto" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} onBlur={() => setRange("custom")} aria-label="To" />
              </div>
            )}
          </div>
        )}
      </motion.div>

      {/* KPIs */}
      {isManager ? (
        <Stagger className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          <Kpi label="Active projects" value={k.activeProjects} icon={Briefcase} tone="#8b5cf6" href="/projects" />
          <Kpi label="Open tasks" value={k.open} icon={ListTodo} tone="#38bdf8" href="/tasks?status=BACKLOG,READY,SCHEDULED,IN_PROGRESS,SUBMITTED,CHANGES_REQUESTED,BLOCKED,ON_HOLD" />
          <Kpi label="Completed" value={k.completed} icon={CheckCircle2} tone="#10b981" help="Tasks approved within the selected range." href="/tasks?status=APPROVED" />
          <Kpi label="Overdue" value={k.overdue} icon={Flame} tone="#ef4444" help="Open tasks whose deadline has passed." href="/tasks?overdue=1" />
          <Kpi label="Awaiting review" value={k.awaitingReview} icon={Eye} tone="#f59e0b" href="/tasks?needsReview=1" />
          <Kpi label="Blocked" value={k.blocked} icon={Ban} tone="#f43f5e" href="/tasks?status=BLOCKED" />
          <Kpi label="Completion rate" value={k.completionRate} suffix="%" icon={Gauge} tone="#a855f7" help="Of tasks created in the range (excluding cancelled), the share already approved. — when none were created." />
          <Kpi label="On-time rate" value={k.onTimeRate} suffix="%" icon={TrendingUp} tone="#22d3ee" help="Of tasks approved in the range that had a deadline, the share approved on or before it. — when none." />
        </Stagger>
      ) : (
        <Stagger className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Kpi label="Due today" value={mine.dueToday.length} icon={CalendarClock} tone="#38bdf8" />
          <Kpi label="In progress" value={k.inProgress} icon={Activity} tone="#a855f7" href="/board" />
          <Kpi label="Awaiting review" value={mine.inReview.length} icon={Eye} tone="#f59e0b" />
          <Kpi label="Returned for changes" value={mine.returned.length} icon={RotateCcw} tone="#f97316" />
          <Kpi label="Overdue" value={mine.overdue.length} icon={Flame} tone="#ef4444" />
          <Kpi label="Hours (7 days)" value={Math.round((mine.minutesThisWeek / 60) * 10) / 10} icon={Timer} tone="#10b981" help="Time you logged on tasks in the last 7 days." />
        </Stagger>
      )}

      {!isManager && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Today’s schedule" subtitle="Time blocks booked for you today" icon={<CalendarClock className="h-4 w-4" />} action={<Link href="/calendar" className="text-xs text-accent-2 hover:underline">Open calendar</Link>} />
            {mine.todaySchedule.length === 0 ? <p className="px-5 py-8 text-center text-xs text-muted">Nothing booked today. Pick tasks from your board.</p> : (
              <div className="space-y-2 p-4">
                {mine.todaySchedule.map((t, i) => (
                  <motion.div key={t.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }} className="flex items-center gap-4">
                    <div className="w-20 shrink-0 text-right font-mono text-xs text-muted">{fmtTime(t.scheduledStart!)}<br />{fmtTime(t.scheduledEnd!)}</div>
                    <div className="flex-1 overflow-hidden rounded-xl border border-line bg-panel"><TaskRow t={t} extra={<StatusBadge status={t.status} />} /></div>
                  </motion.div>
                ))}
              </div>
            )}
          </Card>
          <Card>
            <CardHeader title="Returned for changes" subtitle="Fix and resubmit" icon={<RotateCcw className="h-4 w-4" />} />
            <List items={mine.returned} empty="Nothing returned. Nice work." />
          </Card>
          <Card>
            <CardHeader title="Overdue" icon={<AlertTriangle className="h-4 w-4" />} />
            <List items={mine.overdue} empty="No overdue tasks 🎉" extra={(t) => <span className="text-[11px] text-red-400">{fmtDate(t.dueAt)}</span>} />
          </Card>
          <Card>
            <CardHeader title="Due today & upcoming" icon={<Clock className="h-4 w-4" />} />
            <List items={[...mine.dueToday, ...mine.upcoming]} empty="No upcoming deadlines." extra={(t) => <span className="text-[11px] text-muted">{fmtDate(t.dueAt, { weekday: "short", day: "numeric" })}</span>} />
          </Card>
          <Card>
            <CardHeader title="Waiting for review" icon={<Eye className="h-4 w-4" />} />
            <List items={mine.inReview} empty="Nothing waiting." />
            <div className="border-t border-line"><CardHeader title="Recently completed" icon={<CheckCircle2 className="h-4 w-4" />} /></div>
            <List items={mine.recentlyDone} empty="No approved work yet." />
          </Card>
        </div>
      )}

      {isManager && (
        <>
          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title="Tasks created vs completed" subtitle="Per day, company time" icon={<TrendingUp className="h-4 w-4" />} />
              <div className="p-5"><DailyChart data={data.daily} /></div>
            </Card>
            <Card>
              <CardHeader title="Status distribution" subtitle="All tasks in scope" icon={<Gauge className="h-4 w-4" />} />
              <div className="p-4"><StatusBars data={data.statusDistribution} /></div>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            {(user.role === "ADMIN" || user.role === "ACCOUNT_MANAGER") && (
              <Card>
                <CardHeader title="Workload by department" subtitle="Open tasks" icon={<Briefcase className="h-4 w-4" />} />
                <div className="p-5"><DepartmentBars data={data.workloadByDepartment} /></div>
              </Card>
            )}
            <Card className={cn(user.role === "ADMIN" || user.role === "ACCOUNT_MANAGER" ? "xl:col-span-2" : "xl:col-span-3")}>
              <CardHeader title="Team workload" subtitle="Open tasks and hours booked over the next 7 days vs weekly capacity" icon={<Activity className="h-4 w-4" />} action={<Link href="/team" className="text-xs text-accent-2 hover:underline">Team schedule</Link>} />
              {data.workloadByPerson.length === 0 ? <EmptyState title="No assigned work" /> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead><tr className="text-[11px] uppercase tracking-wider text-muted"><th className="px-5 py-2 text-left">Person</th><th className="px-3 text-right">Open</th><th className="px-3 text-right">Overdue</th><th className="px-3 text-right">In review</th><th className="w-[34%] px-5 text-left">Booked / capacity</th></tr></thead>
                    <tbody>
                      {data.workloadByPerson.slice(0, 10).map((p) => {
                        const pctv = p.capacityMin ? (p.scheduledMin / p.capacityMin) * 100 : 0;
                        return (
                          <tr key={p.id} className="border-t border-line">
                            <td className="px-5 py-2.5"><span className="inline-flex items-center gap-2"><Avatar name={p.name} color={p.color} size={24} />{p.name}</span></td>
                            <td className="px-3 text-right tabular-nums">{p.open}</td>
                            <td className={cn("px-3 text-right tabular-nums", p.overdue && "text-red-400")}>{p.overdue}</td>
                            <td className="px-3 text-right tabular-nums">{p.inReview}</td>
                            <td className="px-5"><div className="flex items-center gap-2"><Progress value={pctv} color={pctv > 100 ? "#ef4444" : pctv > 80 ? "#f59e0b" : undefined} /><span className="w-24 shrink-0 text-right text-[11px] text-muted">{formatMinutes(p.scheduledMin)} / {formatMinutes(p.capacityMin)}</span></div></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card>
              <CardHeader title="Project progress" subtitle="Approved ÷ all non-cancelled tasks" icon={<Briefcase className="h-4 w-4" />} />
              <div className="space-y-4 p-5">
                {data.projectProgress.length === 0 && <p className="text-center text-xs text-muted">No projects yet.</p>}
                {data.projectProgress.map((p) => (
                  <Link key={p.id} href={`/projects/${p.id}`} className="block space-y-1.5 rounded-lg transition hover:opacity-90">
                    <div className="flex items-center justify-between text-sm"><span className="truncate text-fg">{p.name}</span><span className="text-xs tabular-nums text-muted">{p.done}/{p.total} · {p.progress}%</span></div>
                    <Progress value={p.progress} color={p.color} />
                    <div className="text-[11px] text-muted">{p.client.name}{p.targetDate ? ` · target ${fmtDate(p.targetDate)}` : ""}</div>
                  </Link>
                ))}
              </div>
            </Card>
            <Card>
              <CardHeader title="Upcoming deadlines" icon={<CalendarClock className="h-4 w-4" />} action={<Link href="/calendar" className="text-xs text-accent-2 hover:underline">Calendar</Link>} />
              <List items={data.upcoming} empty="No upcoming deadlines." extra={(t) => <span className="text-[11px] text-muted">{fmtDateTime(t.dueAt)}</span>} />
            </Card>
            <Card>
              <CardHeader title="Recent activity" icon={<Activity className="h-4 w-4" />} />
              <ul className="divide-y divide-[var(--line)]">
                {data.recentActivity.length === 0 && <li className="px-5 py-8 text-center text-xs text-muted">No activity yet.</li>}
                {data.recentActivity.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 px-5 py-2.5">
                    <Avatar name={a.actor?.name ?? "System"} color={a.actor?.avatarColor} size={24} />
                    <div className="min-w-0 text-xs">
                      <div className="text-fg-2"><strong className="text-fg">{a.actor?.name ?? "System"}</strong> {a.action.replace("task.", "").replace(/_/g, " ")} {a.task && <span className="text-muted">· {taskRef(a.task.number)} {a.task.title}</span>}</div>
                      <div className="text-[10px] text-muted">{relative(a.createdAt)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
