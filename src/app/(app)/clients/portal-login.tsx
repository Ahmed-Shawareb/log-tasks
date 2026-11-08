"use client";
import { useEffect, useState } from "react";
import { KeyRound, MonitorSmartphone, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api, relative } from "@/lib/client";
import { CopyField } from "@/components/forms";
import { Badge, Button, Card, CardHeader, Field, Input } from "@/components/ui";

export type PortalLogin = { email: string; isActive: boolean; lastLoginAt: string | null } | null;

/** A strong password the admin can hand to the client (10+ chars, upper, lower, digit). */
export function suggestPassword() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const r = crypto.getRandomValues(new Uint32Array(12));
  return `Cl-${Array.from(r, (n) => a[n % a.length]).join("")}-7`;
}

/** LOG clients sign in at /portal; personal clients at /space, which carries no LOG branding. */
export const portalUrl = (personal = false) => `${typeof window === "undefined" ? "" : window.location.origin}${personal ? "/space/login" : "/portal/login"}`;

/** Admin-only: the client's own login to their dashboard. */
export function PortalLoginCard({ clientId, login, onSaved, personal = false }: { clientId: string; login: PortalLogin; onSaved: () => void; personal?: boolean }) {
  const [email, setEmail] = useState(login?.email ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("/portal");
  useEffect(() => setUrl(portalUrl(personal)), [personal]);
  useEffect(() => setEmail(login?.email ?? ""), [login?.email]);

  const save = async (extra: { isActive?: boolean } = {}) => {
    setBusy(true);
    try {
      await api(`/api/clients/${clientId}/portal`, { method: "PUT", body: { email, ...(password ? { password } : {}), ...extra } });
      toast.success(login ? "Client login updated" : "Client login created", { description: password ? "Send the client the link, email and password." : undefined });
      onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); }
    finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader title="Client dashboard" icon={<MonitorSmartphone className="h-4 w-4" />}
        subtitle="The client signs in here to see their feed, deliverables and dates."
        action={login && <Badge color={login.isActive ? "#10b981" : "#94a3b8"} dot>{login.isActive ? "Active" : "Turned off"}</Badge>} />
      <div className="space-y-3 px-5 py-4">
        <Field label="Dashboard link"><CopyField value={url} /></Field>
        <Field label="Client's email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@company.com" /></Field>
        <Field label={login ? "New password (leave empty to keep it)" : "Password"} hint="At least 10 characters with upper- and lower-case letters and a number.">
          <div className="flex gap-2">
            <Input value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            <Button type="button" size="icon" variant="ghost" aria-label="Suggest a password" title="Suggest a password" onClick={() => setPassword(suggestPassword())}><RefreshCw className="h-4 w-4" /></Button>
          </div>
        </Field>
        {password && <Field label="Copy the password now"><CopyField value={password} /></Field>}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button size="sm" variant="primary" loading={busy} disabled={!email || (!login && !password)} onClick={() => save()}><KeyRound className="h-4 w-4" /> {login ? "Save login" : "Create login"}</Button>
          {login && <Button size="sm" variant="ghost" disabled={busy} onClick={() => save({ isActive: !login.isActive })}>{login.isActive ? "Turn off access" : "Turn access back on"}</Button>}
        </div>
        {login && <p className="text-[11px] text-muted">{login.lastLoginAt ? `Last signed in ${relative(login.lastLoginAt)}` : "Has not signed in yet"}</p>}
      </div>
    </Card>
  );
}
