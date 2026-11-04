import { cn } from "@/lib/utils";

// The logo is drawn as a mask filled with the current text colour, so it is white in dark mode and black in light mode.
const masked = (src: string): React.CSSProperties => ({
  WebkitMaskImage: `url(${src})`, maskImage: `url(${src})`,
  WebkitMaskSize: "contain", maskSize: "contain",
  WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat",
  WebkitMaskPosition: "center", maskPosition: "center",
});

/** The LOG letters on their own (sidebar when collapsed, watermark). */
export function LogMark({ className }: { className?: string; mono?: boolean }) {
  return <span role="img" aria-label="LOG" className={cn("inline-block h-9 w-9 shrink-0 bg-current", className)} style={masked("/log-mark.png")} />;
}

/** Full logo: LOG | LOTS OF GROWTH. */
export function LogLogo({ className, compact }: { className?: string; compact?: boolean }) {
  if (compact) return <LogMark className={className} />;
  return (
    <span role="img" aria-label="Lots of Growth" className={cn("inline-block h-10 shrink-0 self-start bg-current text-fg", className)}
      style={{ ...masked("/log-logo.png"), WebkitMaskPosition: "left center", maskPosition: "left center", aspectRatio: "627 / 293" }} />
  );
}
