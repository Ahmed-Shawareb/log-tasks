"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight, CalendarRange, CheckCircle2, KanbanSquare, Lock, Mail, ShieldCheck, Sparkles, Users } from "lucide-react";
import { toast } from "sonner";
import { LogLogo, LogMark } from "@/components/logo";
import { Button, Input } from "@/components/ui";
import { api } from "@/lib/client";

const FEATURES = [
  { icon: KanbanSquare, text: "Boards for every role, drag to move work" },
  { icon: CalendarRange, text: "Calendar with deadlines, schedules & availability" },
  { icon: Users, text: "Hand tasks between people without conflicts" },
  { icon: CheckCircle2, text: "Submissions, reviews and full revision history" },
];

export function LoginForm({ devAccounts }: { devAccounts: { role: string; email: string; password: string }[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e?: React.FormEvent, creds?: { email: string; password: string }) {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ mustChangePassword: boolean }>("/api/auth/login", { body: creds ?? { email, password } });
      toast.success("Welcome back");
      router.replace(r.mustChangePassword ? "/settings?changePassword=1" : "/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Brand side */}
      <div className="relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
        <LogLogo />
        <div className="relative">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-xs text-fg-2 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-accent-2" /> Agency operating system
            </div>
            <h1 className="font-display text-6xl font-extrabold uppercase leading-[0.95] tracking-tight xl:text-7xl">
              Lots of work.<br /><span className="text-gradient">Lots of growth.</span>
            </h1>
            <p className="mt-5 max-w-md text-base text-fg-2">From the first client meeting to the final approved deliverable. Every task has an owner and a deadline you can trace.</p>
          </motion.div>
          <div className="mt-10 grid max-w-lg gap-3">
            {FEATURES.map((f, i) => (
              <motion.div key={f.text} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + i * 0.1 }}
                className="glass flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-fg-2">
                <f.icon className="h-4 w-4 text-accent-2" /> {f.text}
              </motion.div>
            ))}
          </div>
        </div>
        <motion.div className="pointer-events-none absolute -right-24 top-1/3 opacity-[0.07]" animate={{ rotate: [0, 6, 0], y: [0, -20, 0] }} transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}>
          <LogMark className="h-[520px] w-[520px]" mono />
        </motion.div>
        <p className="text-xs text-muted">© {new Date().getFullYear()} Lots of Growth Group</p>
      </div>

      {/* Form side */}
      <div className="flex items-center justify-center p-6">
        <motion.div initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 24 }}
          className="glass-strong gradient-border w-full max-w-md rounded-3xl p-8">
          <div className="mb-8 lg:hidden"><LogLogo /></div>
          <h2 className="font-display text-3xl font-bold">Sign in</h2>
          <p className="mt-1 text-sm text-muted">Use your LOG work account.</p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input type="email" autoComplete="username" required placeholder="you@lotsofgrowthgroup.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 pl-9" aria-label="Email" />
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input type="password" autoComplete="current-password" required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 pl-9" aria-label="Password" />
            </div>
            {error && (
              <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </motion.p>
            )}
            <Button type="submit" variant="primary" loading={loading} className="h-11 w-full">
              Sign in <ArrowRight className="h-4 w-4" />
            </Button>
            <div className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1 text-muted"><ShieldCheck className="h-3.5 w-3.5" /> Encrypted session</span>
              <Link href="/forgot-password" className="text-accent-2 hover:underline">Forgot password?</Link>
            </div>
          </form>

          {devAccounts.length > 0 && (
            <div className="mt-8 rounded-2xl border border-dashed border-amber-500/40 bg-amber-500/5 p-4">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-amber-400">Local development · test accounts</div>
              <div className="grid gap-1.5">
                {devAccounts.map((a) => (
                  <button key={a.email} type="button" disabled={loading}
                    onClick={() => { setEmail(a.email); setPassword(a.password); submit(undefined, a); }}
                    className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition hover:bg-panel-hover">
                    <span className="font-medium text-fg">{a.role}</span>
                    <span className="text-muted">{a.email}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
