"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { AnimatePresence, motion } from "motion/react";
import { BarChart3, Briefcase, CalendarDays, ClipboardList, KanbanSquare, LayoutDashboard, Plus, Search, UserRound, UsersRound } from "lucide-react";
import { api } from "@/lib/client";
import { taskRef } from "@/lib/utils";
import { useApp } from "./app-context";
import { StatusBadge, Avatar } from "./ui";

type Results = {
  tasks: { id: string; number: number; title: string; status: string; project: { name: string } | null }[];
  projects: { id: string; name: string; client: { name: string } }[];
  people: { id: string; name: string; avatarColor: string; title: string | null }[];
};

const item = "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-fg-2 data-[selected=true]:bg-accent-soft data-[selected=true]:text-fg";

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { openTask, openCreate, isManager } = useApp();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Results>({ tasks: [], projects: [], people: [] });

  useEffect(() => {
    if (!open) { setQ(""); return; }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      if (q.trim().length >= 2) api<Results>(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal }).then(setRes).catch(() => {});
      else setRes({ tasks: [], projects: [], people: [] });
    }, 160);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, open]);

  const go = (href: string) => { onClose(); router.push(href); };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-start justify-center p-4 pt-[12vh]">
          <motion.div className="absolute inset-0 bg-black/55 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div initial={{ opacity: 0, y: -12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="glass-strong gradient-border relative w-full max-w-xl overflow-hidden rounded-2xl">
            <Command shouldFilter={false} label="Command palette" onKeyDown={(e) => e.key === "Escape" && onClose()}>
              <div className="flex items-center gap-3 border-b border-line px-4">
                <Search className="h-4 w-4 text-muted" />
                <Command.Input autoFocus value={q} onValueChange={setQ} placeholder="Search or jump to…" className="h-14 w-full bg-transparent text-sm text-fg outline-none placeholder:text-muted" />
              </div>
              <Command.List className="max-h-[55vh] overflow-y-auto p-2">
                <Command.Empty className="px-3 py-8 text-center text-xs text-muted">{q.length < 2 ? "Type at least 2 characters" : "No results"}</Command.Empty>
                {res.tasks.length > 0 && (
                  <Command.Group heading="Tasks" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-muted">
                    {res.tasks.map((t) => (
                      <Command.Item key={t.id} value={`task-${t.id}`} className={item} onSelect={() => { onClose(); openTask(t.id); }}>
                        <span className="font-mono text-[11px] text-muted">{taskRef(t.number)}</span>
                        <span className="min-w-0 flex-1 truncate">{t.title}</span>
                        <StatusBadge status={t.status} />
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
                {res.projects.length > 0 && (
                  <Command.Group heading="Projects" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-muted">
                    {res.projects.map((p) => (
                      <Command.Item key={p.id} value={`project-${p.id}`} className={item} onSelect={() => go(`/projects/${p.id}`)}>
                        <Briefcase className="h-4 w-4 text-accent-2" /> <span className="flex-1 truncate">{p.name}</span> <span className="text-xs text-muted">{p.client.name}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
                {res.people.length > 0 && (
                  <Command.Group heading="People" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-muted">
                    {res.people.map((p) => (
                      <Command.Item key={p.id} value={`person-${p.id}`} className={item} onSelect={() => go(`/calendar?assigneeId=${p.id}`)}>
                        <Avatar name={p.name} color={p.avatarColor} size={22} /> <span className="flex-1">{p.name}</span> <span className="text-xs text-muted">View schedule</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
                {q.length < 2 && (
                  <Command.Group heading="Jump to" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-muted">
                    {isManager && <Command.Item value="new" className={item} onSelect={() => { onClose(); openCreate(); }}><Plus className="h-4 w-4 text-accent-2" /> New task <kbd className="ml-auto text-[10px] text-muted">N</kbd></Command.Item>}
                    <Command.Item value="dash" className={item} onSelect={() => go("/dashboard")}><LayoutDashboard className="h-4 w-4" /> Dashboard</Command.Item>
                    <Command.Item value="mine" className={item} onSelect={() => go("/tasks?mine=1")}><UserRound className="h-4 w-4" /> My tasks</Command.Item>
                    <Command.Item value="tasks" className={item} onSelect={() => go("/tasks")}><ClipboardList className="h-4 w-4" /> All tasks</Command.Item>
                    <Command.Item value="board" className={item} onSelect={() => go("/board")}><KanbanSquare className="h-4 w-4" /> Board</Command.Item>
                    <Command.Item value="cal" className={item} onSelect={() => go("/calendar")}><CalendarDays className="h-4 w-4" /> Calendar</Command.Item>
                    {isManager && <Command.Item value="team" className={item} onSelect={() => go("/team")}><UsersRound className="h-4 w-4" /> Team schedule</Command.Item>}
                    {isManager && <Command.Item value="reports" className={item} onSelect={() => go("/reports")}><BarChart3 className="h-4 w-4" /> Reports</Command.Item>}
                  </Command.Group>
                )}
              </Command.List>
            </Command>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
