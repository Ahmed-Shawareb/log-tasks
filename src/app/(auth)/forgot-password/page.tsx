"use client";
import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowLeft, MailCheck } from "lucide-react";
import { LogLogo } from "@/components/logo";
import { Button, Input } from "@/components/ui";
import { api } from "@/lib/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-strong gradient-border w-full max-w-md rounded-3xl p-8">
        <LogLogo className="mb-8" />
        {done ? (
          <div className="space-y-4 text-center">
            <MailCheck className="mx-auto h-10 w-10 text-accent-2" />
            <p className="text-sm text-fg-2">{done}</p>
            <Link href="/login" className="text-sm text-accent-2 hover:underline">Back to sign in</Link>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            try {
              const r = await api<{ message: string }>("/api/auth/forgot", { body: { email } });
              setDone(r.message);
            } finally {
              setLoading(false);
            }
          }}>
            <h1 className="font-display text-3xl font-bold">Reset password</h1>
            <p className="text-sm text-muted">Enter your work email. An administrator will be notified and can send you a secure, single-use reset link.</p>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@lotsofgrowthgroup.com" aria-label="Email" />
            <Button variant="primary" className="w-full" loading={loading}>Request reset</Button>
            <Link href="/login" className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg"><ArrowLeft className="h-3 w-3" /> Back to sign in</Link>
          </form>
        )}
      </motion.div>
    </div>
  );
}
