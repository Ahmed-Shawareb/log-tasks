"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock, Download, ExternalLink, Eye, LayoutGrid, ListChecks, LogOut, Moon, Package, Play, Sun } from "lucide-react";
import { toast } from "sonner";
import { LogLogo } from "@/components/logo";
import { Button, Card, Modal, Progress, Skeleton } from "@/components/ui";
import { FeedGrid, KIND_LABEL, KindIcon, downloadGrid, imgUrl, type FeedPost } from "@/components/feed-grid";
import { cn } from "@/lib/utils";

type State = "done" | "review" | "in_progress" | "upcoming";
type Item = { id: string; projectId: string; title: string; step: string | null; type: string | null; quantity: number | null; color: string; dueAt: string | null; completedAt: string | null; state: State; orderId: string | null };
type Order = { id: string; projectId: string; name: string; quantity: number; unit: string; color: string; dueAt: string | null; nextDue: string | null; done: number; steps: { name: string; done: number; planned: number }[] };
type Project = { id: string; name: string; kind: "STANDARD" | "SOCIAL_MEDIA"; color: string; status: string; startDate: string | null; targetDate: string | null; progress: number; posts: FeedPost[] };
type Overview = { client: string; updatedAt: string; summary: { total: number; done: number; review: number; progress: number }; projects: Project[]; orders: Order[]; items: Item[] };

const STATE: Record<State, { label: string; color: string }> = {
  done: { label: "Delivered", color: "#10b981" },
  review: { label: "Being checked", color: "#f59e0b" },
  in_progress: { label: "In progress", color: "#3b82f6" },
  upcoming: { label: "Coming up", color: "#94a3b8" },
};
const day = (d: string | Date, o: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) => new Date(d).toLocaleDateString(undefined, o);
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const POLL_MS = 15_000;

function useTheme() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => setTheme((document.documentElement.dataset.theme as "dark" | "light") ?? "dark"), []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("log-theme", next); } catch { /* private mode */ }
  };
  return { theme, toggle };
}

export function PortalDashboard({ clientName }: { clientName: string }) {
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const [data, setData] = useState<Overview | null>(null);
  const [tab, setTab] = useState<"feed" | "deliverables" | "calendar">("feed");

  const load = useCallback(async () => {
    const r = await fetch("/api/portal/overview", { cache: "no-store" });
    if (r.status === 401) { router.replace("/portal/login"); return; }
    if (r.ok) setData(await r.json());
  }, [router]);
  // The account manager's updates show up on their own: refresh every few seconds and when the tab comes back.
  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, POLL_MS);
    const v = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", v);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", v); };
  }, [load]);
  useEffect(() => { if (data && !data.projects.some((p) => p.kind === "SOCIAL_MEDIA") && tab === "feed") setTab("deliverables"); }, [data, tab]);

  const logout = async () => { await fetch("/api/portal/logout", { method: "POST" }); router.replace("/portal/login"); };
  const next = data?.items.find((i) => i.state !== "done" && i.dueAt && new Date(i.dueAt) >= new Date(new Date().setHours(0, 0, 0, 0)));
  const hasFeed = !!data?.projects.some((p) => p.kind === "SOCIAL_MEDIA");

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
      <header className="flex items-center justify-between gap-3 py-5">
        <LogLogo className="h-8" />
        <div className="flex items-center gap-1">
          <span className="mr-2 hidden items-center gap-1.5 text-[11px] text-muted sm:inline-flex"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> Live</span>
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">{theme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}</Button>
          <Button variant="ghost" size="sm" onClick={logout}><LogOut className="h-4 w-4" /> Sign out</Button>
        </div>
      </header>

      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-2">
        <p className="text-sm text-muted">Welcome back</p>
        <h1 className="font-display text-4xl font-extrabold uppercase tracking-tight sm:text-5xl">{clientName}</h1>
        <p className="mt-1 text-sm text-fg-2">Here is everything we are making for you, and when it is coming.</p>
      </motion.section>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {!data ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />) : [
          { label: "Overall progress", value: `${data.summary.progress}%`, icon: CheckCircle2, color: "#10b981", extra: <Progress value={data.summary.progress} className="mt-2 h-1.5" color="linear-gradient(90deg,#10b981,#22d3ee)" /> },
          { label: "Delivered", value: `${data.summary.done} / ${data.summary.total}`, icon: Package, color: "#8b5cf6" },
          { label: "Being checked", value: data.summary.review, icon: Eye, color: "#f59e0b" },
          { label: "Next delivery", value: next?.dueAt ? day(next.dueAt, { day: "numeric", month: "short" }) : "—", icon: Clock, color: "#3b82f6", extra: next && <div className="mt-1 truncate text-[11px] text-muted">{next.step ?? next.title}</div> },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="h-full p-4">
              <div className="flex items-center justify-between text-xs text-muted">{s.label}<s.icon className="h-4 w-4" style={{ color: s.color }} /></div>
              <div className="mt-2 font-display text-3xl font-bold tabular-nums">{s.value}</div>
              {s.extra}
            </Card>
          </motion.div>
        ))}
      </div>

      <nav className="glass mt-6 inline-flex rounded-2xl p-1" aria-label="Sections">
        {([hasFeed && ["feed", "Feed", LayoutGrid], ["deliverables", "Deliverables", ListChecks], ["calendar", "Calendar", CalendarDays]].filter(Boolean) as [typeof tab, string, typeof LayoutGrid][]).map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm transition", tab === k ? "bg-accent-soft font-semibold text-fg" : "text-muted hover:text-fg")}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </nav>

      <div className="mt-5">
        {!data ? <Skeleton className="h-96 rounded-2xl" /> : (
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
              {tab === "feed" && <FeedTab data={data} />}
              {tab === "deliverables" && <DeliverablesTab data={data} />}
              {tab === "calendar" && <CalendarTab data={data} />}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
      {data && <p className="mt-8 text-center text-[11px] text-muted">Updated {new Date(data.updatedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} · refreshes on its own</p>}
    </div>
  );
}

// ───────────────────────────── feed ─────────────────────────────

function FeedTab({ data }: { data: Overview }) {
  const feeds = data.projects.filter((p) => p.kind === "SOCIAL_MEDIA");
  const [pid, setPid] = useState(feeds[0]?.id);
  const [open, setOpen] = useState<FeedPost | null>(null);
  const [busy, setBusy] = useState(false);
  const p = feeds.find((f) => f.id === pid) ?? feeds[0];
  if (!p) return null;
  const ready = p.posts.filter((x) => x.media.length).length;
  const count = (k: FeedPost["kind"]) => p.posts.filter((x) => x.kind === k).length;
  const live = open ? p.posts.find((x) => x.id === open.id) ?? open : null;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <Card className="p-5">
        {feeds.length > 1 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {feeds.map((f) => <button key={f.id} onClick={() => setPid(f.id)} className={cn("rounded-full border px-3 py-1 text-xs transition", f.id === p.id ? "border-[var(--accent)] bg-accent-soft text-fg" : "border-line text-muted hover:text-fg")}>{f.name}</button>)}
          </div>
        )}
        <div className="mx-auto max-w-lg">
          <div className="mb-4 flex items-center gap-4">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full p-[3px]" style={{ background: "linear-gradient(135deg,#f59e0b,#ec4899,#8b5cf6)" }}>
              <div className="grid h-full w-full place-items-center rounded-full bg-panel-solid font-display text-xl font-bold">{data.client.slice(0, 1)}</div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-fg">{data.client}</div>
              <div className="mt-1 flex gap-4 text-xs text-muted">
                <span><b className="text-fg">{p.posts.length}</b> posts</span>
                <span><b className="text-fg">{count("REEL")}</b> reels</span>
                <span><b className="text-fg">{count("CAROUSEL")}</b> carousels</span>
              </div>
            </div>
            <Button size="sm" loading={busy} onClick={async () => { setBusy(true); try { await downloadGrid(p.posts, `${data.client} ${p.name}`); } catch { toast.error("Download failed"); } finally { setBusy(false); } }}>
              <Download className="h-4 w-4" /> Download
            </Button>
          </div>
          <FeedGrid posts={p.posts} onPick={(x) => (x.media.length || x.link || x.driveLink ? setOpen(x) : undefined)} />
        </div>
      </Card>
      <div className="space-y-4">
        <Card className="p-5">
          <div className="text-xs text-muted">{p.name}</div>
          <div className="mt-1 font-display text-3xl font-bold tabular-nums">{ready} <span className="text-base font-medium text-muted">of {p.posts.length} ready</span></div>
          <Progress value={p.posts.length ? (ready / p.posts.length) * 100 : 0} className="mt-3 h-1.5" color={p.color} />
          <p className="mt-3 text-xs text-fg-2">This is how your profile will look. Tap a post to see it; reels open the video.</p>
        </Card>
        <Card className="p-5">
          <div className="mb-3 text-sm font-semibold">Going live next</div>
          <ul className="space-y-2">
            {p.posts.filter((x) => x.publishAt && new Date(x.publishAt) >= new Date(new Date().setHours(0, 0, 0, 0))).sort((a, b) => +new Date(a.publishAt!) - +new Date(b.publishAt!)).slice(0, 5).map((x) => (
              <li key={x.id} className="flex items-center gap-3 text-sm">
                <span className="w-16 shrink-0 text-xs text-muted">{day(x.publishAt!, { day: "numeric", month: "short" })}</span>
                <span className="inline-flex items-center gap-1 text-fg-2"><KindIcon kind={x.kind} className="h-3 w-3" /> {KIND_LABEL[x.kind]} {x.position}</span>
              </li>
            ))}
            {!p.posts.some((x) => x.publishAt) && <li className="text-xs text-muted">Dates will appear here once they are planned.</li>}
          </ul>
        </Card>
      </div>
      <PostViewer post={live} onClose={() => setOpen(null)} />
    </div>
  );
}

function PostViewer({ post, onClose }: { post: FeedPost | null; onClose: () => void }) {
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [post?.id]);
  if (!post) return null;
  const n = post.media.length;
  return (
    <Modal open onClose={onClose} title={`${KIND_LABEL[post.kind]} ${post.position}`} subtitle={post.publishAt ? `Goes live ${day(post.publishAt)}` : undefined}
      footer={post.link || post.driveLink ? <>
        {post.driveLink && <a href={post.driveLink} target="_blank" rel="noopener noreferrer"><Button><ExternalLink className="h-4 w-4" /> Cover and video on Drive</Button></a>}
        {post.link && <a href={post.link} target="_blank" rel="noopener noreferrer"><Button variant="primary">{post.kind === "REEL" ? <><Play className="h-4 w-4 fill-current" /> Watch the video</> : <><ExternalLink className="h-4 w-4" /> Open the post</>}</Button></a>}
      </> : undefined}>
      <div className="relative mx-auto aspect-[4/5] max-w-sm overflow-hidden rounded-xl bg-panel">
        {n ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imgUrl(post.media[i]!)} alt="" className="h-full w-full object-cover" />
        ) : <div className="grid h-full place-items-center text-sm text-muted">The visual is on its way</div>}
        {post.kind === "REEL" && post.link && (
          <a href={post.link} target="_blank" rel="noopener noreferrer" className="absolute inset-0 grid place-items-center bg-black/20 transition hover:bg-black/30" aria-label="Watch the video">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-white/90 text-black shadow-lg"><Play className="ml-1 h-7 w-7 fill-current" /></span>
          </a>
        )}
        {n > 1 && <>
          <button aria-label="Previous image" onClick={() => setI((i - 1 + n) % n)} className="absolute left-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-black"><ChevronLeft className="h-4 w-4" /></button>
          <button aria-label="Next image" onClick={() => setI((i + 1) % n)} className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-black"><ChevronRight className="h-4 w-4" /></button>
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1">{post.media.map((m, k) => <span key={m} className={cn("h-1.5 w-1.5 rounded-full", k === i ? "bg-white" : "bg-white/45")} />)}</div>
        </>}
      </div>
      {post.caption && <p className="mx-auto mt-4 max-w-sm whitespace-pre-wrap text-sm text-fg-2">{post.caption}</p>}
    </Modal>
  );
}

// ───────────────────────────── deliverables ─────────────────────────────

function DeliverablesTab({ data }: { data: Overview }) {
  const coming = data.items.filter((i) => i.state !== "done");
  const done = data.items.filter((i) => i.state === "done").sort((a, b) => +new Date(b.completedAt ?? 0) - +new Date(a.completedAt ?? 0));
  return (
    <div className="space-y-5">
      {data.orders.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {data.orders.map((o) => (
            <Card key={o.id} className="relative overflow-hidden p-5">
              <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full opacity-25 blur-2xl" style={{ background: o.color }} />
              <div className="relative flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-muted">{data.projects.find((p) => p.id === o.projectId)?.name}</div>
                  <div className="font-display text-2xl font-bold">{o.quantity} {o.name}</div>
                </div>
                <div className="text-right"><div className="font-display text-2xl font-bold tabular-nums" style={{ color: o.color }}>{o.done}/{o.quantity}</div><div className="text-[11px] text-muted">finished</div></div>
              </div>
              <div className="relative mt-4 space-y-2.5">
                {o.steps.map((s, k) => (
                  <div key={s.name}>
                    <div className="flex justify-between text-xs"><span className="text-fg-2"><span className="mr-1.5 text-muted">{k + 1}.</span>{s.name}</span><span className="tabular-nums text-muted">{s.done} of {o.quantity} done</span></div>
                    <Progress value={(s.done / o.quantity) * 100} className="mt-1 h-1.5" color={o.color} />
                  </div>
                ))}
              </div>
              {o.nextDue && <div className="relative mt-4 inline-flex items-center gap-1.5 text-xs text-muted"><Clock className="h-3.5 w-3.5" /> Next step due {day(o.nextDue)}</div>}
            </Card>
          ))}
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <ItemList title="Coming up" items={coming} empty="Nothing waiting — you're all caught up." />
        <ItemList title="Delivered" items={done} empty="Finished work will show here." />
      </div>
    </div>
  );
}

function ItemList({ title, items, empty }: { title: string; items: Item[]; empty: string }) {
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-line px-5 py-3"><span className="text-sm font-semibold">{title}</span><span className="text-xs text-muted">{items.length}</span></div>
      {items.length === 0 ? <p className="px-5 py-8 text-center text-sm text-muted">{empty}</p> : (
        <ul className="divide-y divide-[var(--line)]">
          {items.slice(0, 40).map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-5 py-2.5">
              <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: i.color }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-fg">{i.step ? <><b className="font-semibold">{i.step}</b>{i.quantity ? ` · ${i.quantity}` : ""} · <span className="text-fg-2">{i.type}</span></> : i.title}</div>
                <div className="text-[11px] text-muted">{i.state === "done" && i.completedAt ? `Delivered ${day(i.completedAt)}` : i.dueAt ? `Due ${day(i.dueAt)}` : "Date to be set"}</div>
              </div>
              <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ color: STATE[i.state].color, background: `color-mix(in srgb, ${STATE[i.state].color} 15%, transparent)` }}>{STATE[i.state].label}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ───────────────────────────── calendar ─────────────────────────────

function CalendarTab({ data }: { data: Overview }) {
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const [picked, setPicked] = useState<Date | null>(null);
  const events = useMemo(() => {
    const ev: { date: Date; label: string; color: string; done: boolean; kind?: FeedPost["kind"] }[] = [];
    for (const i of data.items) {
      const when = i.state === "done" ? i.completedAt ?? i.dueAt : i.dueAt;
      if (when) ev.push({ date: new Date(when), label: i.step ? `${i.step}${i.quantity ? ` · ${i.quantity}` : ""}` : i.title, color: i.color, done: i.state === "done" });
    }
    for (const p of data.projects) for (const x of p.posts) if (x.publishAt) ev.push({ date: new Date(x.publishAt), label: `${KIND_LABEL[x.kind]} ${x.position} goes live`, color: "#ec4899", done: false, kind: x.kind });
    return ev;
  }, [data]);
  const first = new Date(month);
  const lead = first.getDay(); // Sunday first
  const daysIn = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((lead + daysIn) / 7) * 7 }, (_, k) => new Date(month.getFullYear(), month.getMonth(), k - lead + 1));
  const today = new Date();
  const list = picked ? events.filter((e) => sameDay(e.date, picked)) : [];

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <Button size="icon" variant="ghost" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
        <div className="font-display text-2xl font-bold">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</div>
        <Button size="icon" variant="ghost" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wider text-muted">
        {Array.from({ length: 7 }, (_, k) => new Date(2026, 10, 1 + k).toLocaleDateString(undefined, { weekday: "short" })).map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d) => {
          const inMonth = d.getMonth() === month.getMonth();
          const mine = events.filter((e) => sameDay(e.date, d));
          return (
            <button key={d.toISOString()} onClick={() => setPicked(d)}
              className={cn("min-h-[84px] rounded-xl border p-1.5 text-left align-top transition sm:min-h-[104px]", inMonth ? "border-line bg-panel hover:border-line-strong" : "border-transparent opacity-40",
                sameDay(d, today) && "ring-2 ring-[var(--accent)]", picked && sameDay(d, picked) && "bg-accent-soft")}>
              <div className={cn("text-xs font-semibold", sameDay(d, today) ? "text-accent-2" : "text-fg-2")}>{d.getDate()}</div>
              <div className="mt-1 space-y-0.5">
                {mine.slice(0, 3).map((e, k) => (
                  <div key={k} className="flex items-center gap-1 truncate rounded-md px-1 py-0.5 text-[10px] leading-tight" style={{ background: `color-mix(in srgb, ${e.color} 18%, transparent)`, color: "var(--fg)" }}>
                    {e.done ? <Check className="h-2.5 w-2.5 shrink-0 text-emerald-400" /> : <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: e.color }} />}
                    <span className="hidden truncate sm:inline">{e.label}</span>
                  </div>
                ))}
                {mine.length > 3 && <div className="text-[10px] text-muted">+{mine.length - 3} more</div>}
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1"><Check className="h-3 w-3 text-emerald-400" /> Delivered</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-400" /> Coming</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-pink-500" /> Post goes live</span>
      </div>
      {picked && (
        <div className="mt-4 rounded-xl border border-line p-4">
          <div className="mb-2 text-sm font-semibold">{day(picked, { weekday: "long", day: "numeric", month: "long" })}</div>
          {list.length === 0 ? <p className="text-xs text-muted">Nothing planned on this day.</p> : (
            <ul className="space-y-1.5">{list.map((e, k) => <li key={k} className="flex items-center gap-2 text-sm"><span className="h-2 w-2 rounded-full" style={{ background: e.color }} /><span className="text-fg-2">{e.label}</span>{e.done && <span className="text-[11px] text-emerald-400">Delivered</span>}</li>)}</ul>
          )}
        </div>
      )}
    </Card>
  );
}
