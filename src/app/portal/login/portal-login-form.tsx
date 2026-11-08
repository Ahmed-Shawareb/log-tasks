"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight, Lock, Mail } from "lucide-react";
import { LogLogo } from "@/components/logo";
import { Button, Input } from "@/components/ui";

/** `personal`: the unbranded sign-in for personal clients (/space/login). */
export function PortalLoginForm({ personal = false }: { personal?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const r = await fetch("/api/portal/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    if (r.ok) { router.replace(personal ? "/space" : "/portal"); router.refresh(); return; }
    setError((await r.json().catch(() => null))?.error ?? "Sign-in failed");
    setLoading(false);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <motion.div initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 24 }}
        className="glass-strong gradient-border w-full max-w-md rounded-3xl p-8">
        {!personal && <LogLogo />}
        <h1 className="mt-8 font-display text-3xl font-bold">Your dashboard</h1>
        <p className="mt-1 text-sm text-muted">Sign in to follow your content, deliverables and dates.</p>
        <form onSubmit={submit} className="mt-7 space-y-4">
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input type="email" required autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9" aria-label="Email" />
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input type="password" required autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-9" aria-label="Password" />
          </div>
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          <Button type="submit" variant="primary" className="w-full" loading={loading}>Sign in <ArrowRight className="h-4 w-4" /></Button>
        </form>
        <p className="mt-6 text-xs text-muted">Don&apos;t have a login? {personal ? "Ask your contact for one." : "Ask your account manager at Lots of Growth."}</p>
      </motion.div>
    </div>
  );
}
