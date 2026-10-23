"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { Clock, KeyRound, Palette, UserRound } from "lucide-react";
import { toast } from "sonner";
import { ROLE_LABEL, WEEKDAYS, type RoleKey } from "@/lib/constants";
import { api } from "@/lib/client";
import { cn, formatMinutes } from "@/lib/utils";
import type { Person } from "@/lib/types";
import { ColorSwatches, minToTime, useFetch } from "@/components/forms";
import { Avatar, Button, Card, CardHeader, Field, Input, PageHeader, Skeleton, Textarea } from "@/components/ui";

type Me = Person & { phone: string | null; bio: string | null };

export function SettingsClient() {
  const router = useRouter();
  const highlight = useSearchParams().get("changePassword") === "1";
  const { data, reload } = useFetch<{ user: Me }>("/api/me");
  const [p, setP] = useState({ name: "", title: "", phone: "", bio: "", avatarColor: "#8b5cf6" });
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  useEffect(() => {
    if (data) setP({ name: data.user.name, title: data.user.title ?? "", phone: data.user.phone ?? "", bio: data.user.bio ?? "", avatarColor: data.user.avatarColor });
  }, [data]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await api("/api/me", { method: "PATCH", body: { name: p.name, title: p.title || null, phone: p.phone || null, bio: p.bio || null, avatarColor: p.avatarColor } });
      toast.success("Profile saved");
      reload();
      router.refresh();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Could not save"); }
    finally { setSavingProfile(false); }
  };
  const changePw = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    if (pw.next !== pw.confirm) return setPwError("New passwords do not match.");
    setSavingPw(true);
    try {
      await api("/api/auth/password", { body: { current: pw.current, next: pw.next } });
      toast.success("Password changed", { description: "Other devices were signed out." });
      setPw({ current: "", next: "", confirm: "" });
      if (highlight) router.replace("/dashboard");
    } catch (err) { setPwError(err instanceof Error ? err.message : "Could not change password"); }
    finally { setSavingPw(false); }
  };

  if (!data) return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-64" /></div>;
  const u = data.user;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Account" title="Settings" subtitle={`${u.email} · ${ROLE_LABEL[u.role as RoleKey]}${u.department ? ` · ${u.department.name}` : ""}`} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Profile" icon={<UserRound className="h-4 w-4" />} />
          <form onSubmit={saveProfile} className="grid gap-4 p-5 md:grid-cols-2">
            <div className="flex items-center gap-4 md:col-span-2">
              <Avatar name={p.name || u.name} color={p.avatarColor} size={56} />
              <div className="text-xs text-muted">Your role, email and department are managed by an administrator.</div>
            </div>
            <Field label="Name"><Input required minLength={2} value={p.name} onChange={(e) => setP((x) => ({ ...x, name: e.target.value }))} /></Field>
            <Field label="Job title"><Input value={p.title} onChange={(e) => setP((x) => ({ ...x, title: e.target.value }))} /></Field>
            <Field label="Phone"><Input type="tel" value={p.phone} onChange={(e) => setP((x) => ({ ...x, phone: e.target.value }))} /></Field>
            <Field label="Avatar color"><ColorSwatches value={p.avatarColor} onChange={(c) => setP((x) => ({ ...x, avatarColor: c }))} /></Field>
            <Field label="Bio" className="md:col-span-2"><Textarea value={p.bio} onChange={(e) => setP((x) => ({ ...x, bio: e.target.value }))} className="min-h-[70px]" /></Field>
            <div className="md:col-span-2"><Button variant="primary" type="submit" loading={savingProfile}>Save profile</Button></div>
          </form>
        </Card>
        <motion.div animate={highlight ? { scale: [1, 1.015, 1] } : {}} transition={{ duration: 0.6, repeat: highlight ? 2 : 0 }}>
          <Card className={cn(highlight && "border-amber-500/50 shadow-glow")}>
            <CardHeader title="Change password" subtitle={highlight ? "Your password was set by an administrator. Please choose your own now." : "At least 10 characters, with upper- and lower-case letters and a number."} icon={<KeyRound className="h-4 w-4" />} />
            <form onSubmit={changePw} className="grid gap-4 p-5">
              <Field label="Current password"><Input type="password" autoComplete="current-password" required value={pw.current} onChange={(e) => setPw((x) => ({ ...x, current: e.target.value }))} /></Field>
              <Field label="New password"><Input type="password" autoComplete="new-password" required minLength={10} value={pw.next} onChange={(e) => setPw((x) => ({ ...x, next: e.target.value }))} /></Field>
              <Field label="Confirm new password"><Input type="password" autoComplete="new-password" required value={pw.confirm} onChange={(e) => setPw((x) => ({ ...x, confirm: e.target.value }))} /></Field>
              {pwError && <p role="alert" className="text-sm text-danger">{pwError}</p>}
              <div><Button variant="primary" type="submit" loading={savingPw}>Change password</Button></div>
            </form>
          </Card>
        </motion.div>
        <Card>
          <CardHeader title="Working schedule" subtitle="Used to validate scheduling. Ask an administrator to change it." icon={<Clock className="h-4 w-4" />} />
          <div className="space-y-3 p-5">
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d) => <span key={d.iso} className={cn("rounded-lg border px-2.5 py-1 text-xs", u.workDays.includes(d.iso) ? "border-accent/50 bg-accent-soft text-fg" : "border-line text-muted line-through")}>{d.short}</span>)}
            </div>
            <div className="text-sm text-fg-2">{minToTime(u.workStartMin)} – {minToTime(u.workEndMin)} <span className="text-muted">(company timezone)</span></div>
            <div className="text-sm text-fg-2">Weekly capacity: <strong className="text-fg">{formatMinutes(u.weeklyCapacityMin)}</strong></div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Appearance & shortcuts" icon={<Palette className="h-4 w-4" />} />
          <ul className="space-y-2 p-5 text-sm text-fg-2">
            <li>Toggle light / dark mode with the sun/moon button in the top bar. Your choice is remembered on this device.</li>
            <li><kbd className="rounded border border-line px-1.5 text-xs">Ctrl K</kbd> opens search &amp; quick navigation.</li>
            <li><kbd className="rounded border border-line px-1.5 text-xs">N</kbd> creates a new task (managers).</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
