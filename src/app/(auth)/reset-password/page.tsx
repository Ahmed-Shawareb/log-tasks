"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import { LogLogo } from "@/components/logo";
import { Button, Field, Input } from "@/components/ui";
import { api } from "@/lib/client";

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault();
      if (pw !== pw2) return setError("Passwords do not match.");
      setLoading(true);
      setError(null);
      try {
        await api("/api/auth/reset", { body: { token, password: pw } });
        toast.success("Password set. You can sign in now.");
        router.replace("/login");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Reset failed");
      } finally {
        setLoading(false);
      }
    }}>
      <h1 className="font-display text-3xl font-bold">Choose a password</h1>
      <p className="text-sm text-muted">At least 10 characters with upper- and lower-case letters and a number.</p>
      <Field label="New password"><Input type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
      <Field label="Confirm password"><Input type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {!token && <p className="text-sm text-danger">This link is missing its token.</p>}
      <Button variant="primary" className="w-full" loading={loading} disabled={!token}>Set password</Button>
      <Link href="/login" className="block text-center text-xs text-muted hover:text-fg">Back to sign in</Link>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-strong gradient-border w-full max-w-md rounded-3xl p-8">
        <LogLogo className="mb-8" />
        <Suspense><ResetForm /></Suspense>
      </motion.div>
    </div>
  );
}
