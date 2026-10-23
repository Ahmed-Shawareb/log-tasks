"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  BarChart3, Bell, Briefcase, Building2, CalendarDays, CalendarOff, ChevronsLeft, ClipboardList, Command, KanbanSquare,
  LayoutDashboard, LayoutTemplate, LogOut, Menu, Moon, Plus, ScrollText, Settings, Sun, Timer, UserCog, Users, UsersRound, X,
} from "lucide-react";
import { toast } from "sonner";
import { ROLE_LABEL } from "@/lib/constants";
import { api, relative } from "@/lib/client";
import { cn, taskRef } from "@/lib/utils";
import { LogLogo, LogMark } from "./logo";
import { Avatar, Button } from "./ui";
import { useApp } from "./app-context";
import { CommandPalette } from "./command-palette";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; roles?: string[] };
const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Work",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/tasks", label: "Tasks", icon: ClipboardList },
      { href: "/board", label: "Board", icon: KanbanSquare },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/team", label: "Team schedule", icon: UsersRound, roles: ["ADMIN", "ACCOUNT_MANAGER", "PERFORMANCE_MANAGER", "PRODUCTION_MANAGER"] },
    ],
  },
  {
    section: "Agency",
    items: [
      { href: "/projects", label: "Projects", icon: Briefcase },
      { href: "/clients", label: "Clients", icon: Building2, roles: ["ADMIN", "ACCOUNT_MANAGER", "PERFORMANCE_MANAGER", "PRODUCTION_MANAGER"] },
      { href: "/reports", label: "Reports", icon: BarChart3, roles: ["ADMIN", "ACCOUNT_MANAGER", "PERFORMANCE_MANAGER", "PRODUCTION_MANAGER"] },
      { href: "/availability", label: "Availability", icon: CalendarOff },
      { href: "/templates", label: "Templates", icon: LayoutTemplate, roles: ["ADMIN", "ACCOUNT_MANAGER", "PERFORMANCE_MANAGER", "PRODUCTION_MANAGER"] },
    ],
  },
  {
    section: "Admin",
    items: [
      { href: "/admin/users", label: "Users", icon: UserCog, roles: ["ADMIN"] },
      { href: "/admin/teams", label: "Teams", icon: Users, roles: ["ADMIN"] },
      { href: "/admin/audit", label: "Audit log", icon: ScrollText, roles: ["ADMIN"] },
    ],
  },
];

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

function Sidebar({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { user } = useApp();
  const pathname = usePathname();
  return (
    <nav className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-5" aria-label="Main">
      <Link href="/dashboard" className={cn("px-2", collapsed && "px-0 text-center")} onClick={onNavigate}>
        {collapsed ? <LogMark className="mx-auto" /> : <LogLogo />}
      </Link>
      {NAV.map((s) => {
        const items = s.items.filter((i) => !i.roles || i.roles.includes(user.role));
        if (!items.length) return null;
        return (
          <div key={s.section}>
            {!collapsed && <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted/80">{s.section}</div>}
            <ul className="space-y-0.5">
              {items.map((i) => {
                const active = pathname === i.href || pathname.startsWith(i.href + "/");
                return (
                  <li key={i.href}>
                    <Link href={i.href} onClick={onNavigate} title={collapsed ? i.label : undefined}
                      className={cn("group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors", active ? "text-fg" : "text-muted hover:text-fg", collapsed && "justify-center px-0")}>
                      {active && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl bg-gradient-to-r from-[var(--accent-soft)] to-transparent ring-1 ring-[var(--accent)]/25" transition={{ type: "spring", stiffness: 400, damping: 34 }} />}
                      {active && <motion.span layoutId="nav-bar" className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-gradient-to-b from-violet-400 to-fuchsia-500" />}
                      <i.icon className={cn("relative h-[18px] w-[18px] shrink-0 transition-transform group-hover:scale-110", active && "text-accent-2")} />
                      {!collapsed && <span className="relative">{i.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      <div className="mt-auto">
        <Link href="/settings" onClick={onNavigate} className={cn("flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted hover:bg-panel-hover hover:text-fg", collapsed && "justify-center px-0")}>
          <Settings className="h-[18px] w-[18px]" /> {!collapsed && "Settings"}
        </Link>
      </div>
    </nav>
  );
}

type Notif = { id: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string; type: string };

function Notifications() {
  const router = useRouter();
  const { dataVersion } = useApp();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ items: Notif[]; unread: number }>({ items: [], unread: 0 });
  const load = () => api<{ items: Notif[]; unread: number }>("/api/notifications").then(setData).catch(() => {});
  useEffect(() => {
    load();
    const t = setInterval(load, 20_000); // polling keeps notifications fresh without a websocket server
    return () => clearInterval(t);
  }, [dataVersion]);
  const markAll = async () => { await api("/api/notifications", { body: { ids: "all" } }); load(); };
  return (
    <div className="relative">
      <Button variant="ghost" size="icon" aria-label={`Notifications (${data.unread} unread)`} onClick={() => setOpen((o) => !o)}>
        <Bell className="h-[18px] w-[18px]" />
        {data.unread > 0 && (
          <motion.span key={data.unread} initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-gradient-to-br from-rose-500 to-fuchsia-600 px-1 text-[10px] font-bold text-white">
            {data.unread > 99 ? "99+" : data.unread}
          </motion.span>
        )}
      </Button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }}
              className="glass-strong absolute right-0 top-11 z-50 w-[min(92vw,380px)] overflow-hidden rounded-2xl">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <span className="text-sm font-semibold">Notifications</span>
                {data.unread > 0 && <button onClick={markAll} className="text-xs text-accent-2 hover:underline">Mark all read</button>}
              </div>
              <ul className="max-h-[60vh] overflow-y-auto">
                {data.items.length === 0 && <li className="px-4 py-10 text-center text-xs text-muted">You’re all caught up ✨</li>}
                {data.items.map((n) => (
                  <li key={n.id}>
                    <button className={cn("flex w-full gap-3 px-4 py-3 text-left transition hover:bg-panel-hover", !n.readAt && "bg-accent-soft/40")}
                      onClick={async () => {
                        setOpen(false);
                        if (!n.readAt) api("/api/notifications", { body: { ids: [n.id] } }).then(load);
                        if (n.link) router.push(n.link);
                      }}>
                      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-violet-400 shadow-[0_0_10px_#a78bfa]")} />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-fg">{n.title}</span>
                        {n.body && <span className="line-clamp-2 block text-xs text-muted">{n.body}</span>}
                        <span className="mt-0.5 block text-[10px] text-muted/80">{relative(n.createdAt)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function RunningTimer() {
  const { dataVersion, invalidate, openTask } = useApp();
  const [timer, setTimer] = useState<{ startedAt: string; task: { id: string; number: number; title: string } } | null>(null);
  const [, tick] = useState(0);
  useEffect(() => { api<{ timer: typeof timer }>("/api/me").then((r) => setTimer(r.timer)).catch(() => {}); }, [dataVersion]);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  if (!timer) return null;
  const s = Math.floor((Date.now() - new Date(timer.startedAt).getTime()) / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0"), mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0"), ss = String(s % 60).padStart(2, "0");
  return (
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="hidden items-center gap-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 pl-3 text-xs text-emerald-300 md:flex">
      <button onClick={() => openTask(timer.task.id)} className="flex items-center gap-2" title={timer.task.title}>
        <Timer className="h-3.5 w-3.5 animate-pulse" /> <span className="font-mono tabular-nums">{hh}:{mm}:{ss}</span>
        <span className="max-w-28 truncate text-emerald-200/80">{taskRef(timer.task.number)}</span>
      </button>
      <Button size="sm" variant="ghost" className="h-7 text-emerald-300" onClick={async () => { await api("/api/timer", { method: "DELETE" }); toast.success("Time logged"); invalidate(); }}>Stop</Button>
    </motion.div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { user, isManager, openCreate } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    try { setCollapsed(localStorage.getItem("log-sidebar") === "1"); } catch { /* ignore */ }
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((o) => !o); }
      const typing = /input|textarea|select/i.test((e.target as HTMLElement)?.tagName) || (e.target as HTMLElement)?.isContentEditable;
      if (!typing && e.key.toLowerCase() === "n" && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); openCreate(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openCreate]);

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  return (
    <div className="relative z-10 flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside className={cn("glass sticky top-0 hidden h-dvh shrink-0 rounded-none border-y-0 border-l-0 transition-[width] duration-300 lg:block", collapsed ? "w-[76px]" : "w-64")}>
        <Sidebar collapsed={collapsed} />
        <button onClick={() => { setCollapsed((c) => { try { localStorage.setItem("log-sidebar", c ? "0" : "1"); } catch {} return !c; }); }}
          className="absolute -right-3 top-20 grid h-6 w-6 place-items-center rounded-full border border-line-strong bg-panel-solid text-muted shadow hover:text-fg" aria-label="Toggle sidebar">
          <ChevronsLeft className={cn("h-3.5 w-3.5 transition-transform", collapsed && "rotate-180")} />
        </button>
      </aside>

      {/* Mobile sidebar */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-[60] lg:hidden">
            <motion.div className="absolute inset-0 bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)} />
            <motion.aside initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", stiffness: 320, damping: 32 }} className="glass-strong absolute inset-y-0 left-0 w-72">
              <button className="absolute right-3 top-4 text-muted" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
              <Sidebar collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-[color-mix(in_srgb,var(--bg)_55%,transparent)] backdrop-blur-xl">
          <div className="flex h-16 items-center gap-2 px-4 md:px-6">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></Button>
            <button onClick={() => setPaletteOpen(true)} className="group flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-sm text-muted transition hover:border-line-strong md:max-w-md">
              <Command className="h-4 w-4" />
              <span className="truncate">Search tasks, projects, people…</span>
              <kbd className="ml-auto hidden rounded-md border border-line px-1.5 text-[10px] md:inline">Ctrl K</kbd>
            </button>
            <div className="ml-auto flex items-center gap-1.5">
              <RunningTimer />
              {isManager && (
                <Button variant="primary" size="sm" className="h-9" onClick={() => openCreate()} title="New task (N)">
                  <Plus className="h-4 w-4" /> <span className="hidden sm:inline">New task</span>
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
                <motion.span key={theme} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }}>
                  {theme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
                </motion.span>
              </Button>
              <Notifications />
              <div className="relative">
                <button onClick={() => setMenuOpen((o) => !o)} className="flex items-center gap-2 rounded-xl p-1 pr-2 hover:bg-panel-hover" aria-label="Account menu">
                  <Avatar name={user.name} color={user.avatarColor} size={32} />
                  <span className="hidden text-left leading-tight md:block">
                    <span className="block max-w-36 truncate text-xs font-semibold text-fg">{user.name}</span>
                    <span className="block text-[10px] text-muted">{ROLE_LABEL[user.role]}</span>
                  </span>
                </button>
                <AnimatePresence>
                  {menuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="glass-strong absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-2xl p-1.5">
                        <div className="px-3 py-2 text-xs text-muted">{user.email}</div>
                        <Link href="/settings" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-panel-hover"><Settings className="h-4 w-4" /> Profile & password</Link>
                        <button onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-300 hover:bg-red-500/10"><LogOut className="h-4 w-4" /> Sign out</button>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
          {user.mustChangePassword && (
            <Link href="/settings?changePassword=1" className="block border-t border-red-500/30 bg-red-500/10 px-6 py-1.5 text-center text-xs text-red-200 hover:bg-red-500/15">
              You are using a temporary password. Set your own password now →
            </Link>
          )}
          {user.isTestAccount && (
            <div className="border-t border-amber-500/20 bg-amber-500/5 px-6 py-1 text-center text-[11px] text-amber-300/90">
              Test account · synthetic data for local development
            </div>
          )}
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
          <motion.div key={pathname} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
            {children}
          </motion.div>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

export { relative };
