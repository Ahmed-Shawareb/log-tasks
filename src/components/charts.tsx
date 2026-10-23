"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { STATUS_META, type StatusKey } from "@/lib/constants";
import { formatMinutes } from "@/lib/utils";

const axis = { stroke: "var(--muted)", fontSize: 11, tickLine: false, axisLine: false } as const;

function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="glass-strong rounded-xl px-3 py-2 text-xs">
      <div className="mb-1 font-semibold text-fg">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-fg-2">
          {r.color && <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />}
          <span>{r.label}</span><span className="ml-auto pl-4 font-semibold text-fg tabular-nums">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-fg-2">
      {items.map((i) => <span key={i.label} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />{i.label}</span>)}
    </div>
  );
}

/** Created vs completed per day — one shared axis, two thin series, crosshair tooltip. */
export function DailyChart({ data }: { data: { day: string; created: number; completed: number }[] }) {
  const fmt = (d: string) => new Date(d + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <div className="space-y-3">
      <Legend items={[{ label: "Created", color: "var(--series-1)" }, { label: "Completed (approved)", color: "var(--series-2)" }]} />
      <div className="h-56">
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
            <defs>
              <linearGradient id="g-created" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--series-1)" stopOpacity={0.35} /><stop offset="1" stopColor="var(--series-1)" stopOpacity={0} /></linearGradient>
              <linearGradient id="g-done" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--series-2)" stopOpacity={0.3} /><stop offset="1" stopColor="var(--series-2)" stopOpacity={0} /></linearGradient>
            </defs>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="day" tickFormatter={fmt} {...axis} minTickGap={24} />
            <YAxis allowDecimals={false} {...axis} />
            <Tooltip cursor={{ stroke: "var(--line-strong)" }} content={({ active, payload, label }) => active && payload?.length ? (
              <TooltipBox title={fmt(String(label))} rows={[
                { label: "Created", value: String(payload.find((p) => p.dataKey === "created")?.value ?? 0), color: "var(--series-1)" },
                { label: "Completed", value: String(payload.find((p) => p.dataKey === "completed")?.value ?? 0), color: "var(--series-2)" },
              ]} />) : null} />
            <Area type="monotone" dataKey="created" stroke="var(--series-1)" strokeWidth={2} fill="url(#g-created)" activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--panel-solid)" }} />
            <Area type="monotone" dataKey="completed" stroke="var(--series-2)" strokeWidth={2} fill="url(#g-done)" activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--panel-solid)" }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Status distribution as labelled horizontal bars (status colours carry their name on the axis). */
export function StatusBars({ data }: { data: { status: string; count: number }[] }) {
  const order = Object.keys(STATUS_META);
  const rows = [...data].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status)).map((d) => ({ ...d, label: STATUS_META[d.status as StatusKey]?.label ?? d.status }));
  if (!rows.length) return <p className="py-10 text-center text-xs text-muted">No tasks yet.</p>;
  return (
    <div style={{ height: Math.max(160, rows.length * 30) }}>
      <ResponsiveContainer>
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 28, left: 8, bottom: 0 }} barCategoryGap={6}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="label" width={130} {...axis} />
          <Tooltip cursor={{ fill: "var(--panel-hover)" }} content={({ active, payload }) => active && payload?.[0] ? <TooltipBox title={String(payload[0].payload.label)} rows={[{ label: "Tasks", value: String(payload[0].value) }]} /> : null} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} label={{ position: "right", fill: "var(--fg-2)", fontSize: 11 }}>
            {rows.map((r) => <Cell key={r.status} fill={STATUS_META[r.status as StatusKey]?.color ?? "#64748b"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Open work per department (single series → single colour, names on axis). */
export function DepartmentBars({ data }: { data: { name: string; open: number; overdue: number; estimateMin: number }[] }) {
  if (!data.length) return <p className="py-10 text-center text-xs text-muted">No open work.</p>;
  return (
    <div className="h-56">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 16, right: 6, left: -22, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="name" {...axis} interval={0} />
          <YAxis allowDecimals={false} {...axis} />
          <Tooltip cursor={{ fill: "var(--panel-hover)" }} content={({ active, payload }) => active && payload?.[0] ? (
            <TooltipBox title={String(payload[0].payload.name)} rows={[
              { label: "Open tasks", value: String(payload[0].payload.open) },
              { label: "Overdue", value: String(payload[0].payload.overdue) },
              { label: "Estimated effort", value: formatMinutes(payload[0].payload.estimateMin) },
            ]} />) : null} />
          <Bar dataKey="open" fill="var(--series-1)" radius={[4, 4, 0, 0]} label={{ position: "top", fill: "var(--fg-2)", fontSize: 11 }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
