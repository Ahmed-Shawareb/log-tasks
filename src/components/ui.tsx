"use client";
import { forwardRef, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Flag, Loader2, X } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { PRIORITY_META, STATUS_META, type PriorityKey, type StatusKey } from "@/lib/constants";

// ───────────────────────────── Button ─────────────────────────────

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "icon";
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = "secondary", size = "md", loading, className, children, disabled, ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-all duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
        size === "sm" && "h-8 px-3 text-xs",
        size === "md" && "h-10 px-4 text-sm",
        size === "icon" && "h-9 w-9 text-sm",
        variant === "primary" && "bg-gradient-to-br from-violet-500 via-violet-600 to-fuchsia-600 text-white shadow-[0_8px_24px_-8px_rgba(139,92,246,.8)] hover:shadow-[0_10px_30px_-6px_rgba(139,92,246,.9)] hover:brightness-110",
        variant === "secondary" && "border border-line bg-panel text-fg backdrop-blur hover:border-line-strong hover:bg-panel-hover",
        variant === "ghost" && "text-fg-2 hover:bg-panel-hover hover:text-fg",
        variant === "danger" && "bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-[0_8px_24px_-10px_rgba(239,68,68,.8)] hover:brightness-110",
        variant === "success" && "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_8px_24px_-10px_rgba(16,185,129,.8)] hover:brightness-110",
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
});

// ───────────────────────────── Inputs ─────────────────────────────

const field = "w-full rounded-xl border border-line bg-[color-mix(in_srgb,var(--panel-solid)_70%,transparent)] px-3 text-sm text-fg placeholder:text-muted/70 outline-none transition focus:border-accent focus:ring-4 focus:ring-[var(--accent-soft)]";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn(field, "h-10", className)} {...p} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cn(field, "min-h-[90px] py-2.5 leading-relaxed", className)} {...p} />;
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...p }, ref) {
  return (
    <select ref={ref} className={cn(field, "h-10 cursor-pointer appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 fill=%22none%22 stroke=%22%238f95bd%22 stroke-width=%222%22><path d=%22M2 4l4 4 4-4%22/></svg>')] bg-[right_0.75rem_center] bg-no-repeat pr-8 [&>option]:bg-panel-solid", className)} {...p}>
      {children}
    </select>
  );
});

export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-xs font-medium uppercase tracking-wider text-muted">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-muted">{hint}</span>}
      {error && <span className="block text-xs text-danger">{error}</span>}
    </label>
  );
}

// ───────────────────────────── Surfaces ─────────────────────────────

export function Card({ className, children, hover, ...rest }: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div className={cn("glass rounded-2xl", hover && "transition-all duration-300 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-glow", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, icon }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        {icon && <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-2">{icon}</div>}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-fg">{title}</h3>
          {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-accent-2">{eyebrow}</div>}
        <h1 className="font-display text-3xl font-bold tracking-tight text-fg md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </motion.div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent-2 shadow-glow">{icon}</div>
      <div className="text-sm font-semibold text-fg">{title}</div>
      {body && <p className="max-w-sm text-xs text-muted">{body}</p>}
      {action}
    </motion.div>
  );
}

export const Skeleton = ({ className }: { className?: string }) => <div className={cn("skeleton h-4", className)} />;

// ───────────────────────────── Badges ─────────────────────────────

export function Badge({ color = "#8b5cf6", children, className, dot }: { color?: string; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium", className)}
      style={{ color, borderColor: `color-mix(in srgb, ${color} 35%, transparent)`, background: `color-mix(in srgb, ${color} 13%, transparent)` }}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />}
      {children}
    </span>
  );
}

export const StatusBadge = ({ status }: { status: string }) => {
  const m = STATUS_META[status as StatusKey] ?? { label: status, color: "#64748b" };
  return <Badge color={m.color} dot>{m.label}</Badge>;
};

export const PriorityBadge = ({ priority, compact }: { priority: string; compact?: boolean }) => {
  const m = PRIORITY_META[priority as PriorityKey] ?? PRIORITY_META.MEDIUM;
  return (
    <Badge color={m.color}>
      <Flag className="h-3 w-3" />
      {!compact && m.label}
    </Badge>
  );
};

export const OverdueBadge = () => (
  <Badge color="#ef4444">
    <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-red-500" /> Overdue
  </Badge>
);

export function Avatar({ name, color, size = 28, className }: { name: string; color?: string; size?: number; className?: string }) {
  return (
    <span
      title={name}
      className={cn("inline-grid shrink-0 place-items-center rounded-full font-semibold text-white ring-2 ring-[var(--bg)]", className)}
      style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, ${color ?? "#7c3aed"}, color-mix(in srgb, ${color ?? "#7c3aed"} 55%, #000))` }}
    >
      {initials(name)}
    </span>
  );
}

export function Progress({ value, color, className }: { value: number; color?: string; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-[var(--line)]", className)}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="h-full rounded-full"
        style={{ background: color ?? "linear-gradient(90deg, #8b5cf6, #ec4899)" }}
      />
    </div>
  );
}

// ───────────────────────────── Overlays ─────────────────────────────

function usePortal() {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => setEl(document.body), []);
  return el;
}

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
}

export function Modal({ open, onClose, title, subtitle, children, footer, size = "md" }: {
  open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" | "xl";
}) {
  const portal = usePortal();
  const titleId = useId();
  useEscape(open, onClose);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) setTimeout(() => panelRef.current?.querySelector<HTMLElement>("input,textarea,select,button")?.focus(), 60);
  }, [open]);
  if (!portal) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal aria-labelledby={titleId}>
          <motion.div className="absolute inset-0 bg-black/55 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className={cn(
              "glass-strong gradient-border relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl sm:rounded-3xl",
              size === "sm" && "sm:max-w-md", size === "md" && "sm:max-w-xl", size === "lg" && "sm:max-w-3xl", size === "xl" && "sm:max-w-5xl",
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
              <div className="min-w-0">
                <h2 id={titleId} className="text-base font-semibold text-fg">{title}</h2>
                {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    portal,
  );
}

export function Drawer({ open, onClose, children, width = 760 }: { open: boolean; onClose: () => void; children: ReactNode; width?: number }) {
  const portal = usePortal();
  useEscape(open, onClose);
  if (!portal) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70]" role="dialog" aria-modal>
          <motion.div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="glass-strong absolute inset-y-0 right-0 flex w-full flex-col border-l border-line-strong"
            style={{ maxWidth: width }}
          >
            {children}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    portal,
  );
}

export function ConfirmDialog({ open, title, body, confirmLabel = "Confirm", danger, onConfirm, onClose, loading, children }: {
  open: boolean; title: string; body?: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onClose: () => void; loading?: boolean; children?: ReactNode;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant={danger ? "danger" : "primary"} loading={loading} onClick={onConfirm}>{confirmLabel}</Button></>}>
      <div className="flex gap-3">
        {danger && <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />}
        <div className="space-y-3 text-sm text-fg-2">{body}{children}</div>
      </div>
    </Modal>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { key: T; label: ReactNode; count?: number }[]; value: T; onChange: (k: T) => void; className?: string }) {
  const id = useId();
  return (
    <div role="tablist" className={cn("flex gap-1 overflow-x-auto rounded-xl border border-line bg-panel p-1", className)}>
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={value === t.key} onClick={() => onChange(t.key)}
          className={cn("relative flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors", value === t.key ? "text-fg" : "text-muted hover:text-fg")}>
          {value === t.key && <motion.span layoutId={`tab-${id}`} className="absolute inset-0 rounded-lg bg-accent-soft ring-1 ring-[var(--accent)]/30" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
          <span className="relative">{t.label}</span>
          {t.count !== undefined && <span className="relative rounded-full bg-[var(--line)] px-1.5 text-[10px]">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { key: T; label: ReactNode }[]; value: T; onChange: (k: T) => void }) {
  return <Tabs tabs={options} value={value} onChange={onChange} />;
}

/** Stagger children in on mount. */
export function Stagger({ children, className, delay = 0.04 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div className={className} initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: delay } } }}>
      {children}
    </motion.div>
  );
}
export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } } }}>
      {children}
    </motion.div>
  );
}
