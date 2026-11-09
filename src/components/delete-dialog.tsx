"use client";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button, Field, Input, Modal } from "./ui";

/** Permanent delete: the person must type the exact name, so nothing goes by accident. */
export function DeleteDialog({ open, name, what, consequences, onClose, onConfirm }: {
  open: boolean; name: string; what: "client" | "project"; consequences: string; onClose: () => void; onConfirm: () => Promise<void>;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setTyped(""); }, [open]);
  const ok = typed.trim() === name.trim();
  return (
    <Modal open={open} onClose={onClose} size="sm" title={`Delete this ${what} for good?`}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="danger" disabled={!ok} loading={busy} onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}>
          <Trash2 className="h-4 w-4" /> Delete permanently
        </Button>
      </>}>
      <div className="space-y-4 text-sm text-fg-2">
        <p><strong className="text-fg">{name}</strong> {consequences} <strong className="text-red-400">This can&apos;t be undone.</strong> To hide it but keep everything, use Archive instead.</p>
        <Field label={`Type the ${what}'s name to confirm`}>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={name} autoComplete="off" aria-label={`Type ${name} to confirm`} />
        </Field>
      </div>
    </Modal>
  );
}
