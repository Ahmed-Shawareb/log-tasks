import { cn } from "@/lib/utils";

/** LOG mark: three slanted, rising letterforms (from the brand guidelines) + optional wordmark. */
export function LogMark({ className, mono }: { className?: string; mono?: boolean }) {
  const blue = mono ? "currentColor" : "url(#log-blue)";
  const red = mono ? "currentColor" : "url(#log-red)";
  return (
    <svg viewBox="0 0 96 96" className={cn("h-9 w-9", className)} aria-hidden>
      <defs>
        <linearGradient id="log-blue" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#1e4d8f" />
          <stop offset="1" stopColor="#4f7fe0" />
        </linearGradient>
        <linearGradient id="log-red" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#b42d22" />
          <stop offset="1" stopColor="#f0544a" />
        </linearGradient>
      </defs>
      {/* L */}
      <path d="M8 86 V44 L20 38 V72 L32 66 V78 Z" fill={blue} />
      {/* O */}
      <path d="M36 76 V36 L60 24 V64 Z M44 66 L52 62 V38 L44 42 Z" fill={blue} fillRule="evenodd" />
      {/* G */}
      <path d="M64 60 V18 L90 6 V20 L74 28 V46 L80 43 V36 L90 31 V48 Z" fill={red} />
    </svg>
  );
}

export function LogLogo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <LogMark />
      {!compact && (
        <div className="flex items-center gap-3">
          <span className="h-8 w-px bg-gradient-to-b from-transparent via-[var(--line-strong)] to-transparent" />
          <div className="font-display text-[15px] font-bold uppercase leading-[1.02] tracking-wide">
            <div>Lots of</div>
            <div>Growth</div>
          </div>
        </div>
      )}
    </div>
  );
}
