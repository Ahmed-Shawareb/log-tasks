"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { LogLogo } from "./logo";
import { cn } from "@/lib/utils";

// First-time welcome screens: full-screen, cinematic, deep colours over moving light streaks
// (a long-exposure "warp" toward a vanishing point). Always dark, whatever the app theme.

export type Slide = { eyebrow: string; title: string; body: string; points?: string[]; accent: string };

const PALETTE = ["#ff3d81", "#ffb347", "#3ad7ff", "#7c5cff", "#ff5a3d", "#f5f3ff"];

/** Light streaks rushing out of a vanishing point, with a slow swirl. */
function LightTunnel({ accent, step }: { accent: string; step: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const accentRef = useRef(accent);
  accentRef.current = accent;
  // Every new screen: a short burst of speed, like the camera punching forward.
  const boost = useRef(0);
  useEffect(() => { boost.current = 1; }, [step]);
  useEffect(() => {
    const canvas = ref.current!;
    const g = canvas.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, raf = 0, frame = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.width = Math.floor(window.innerWidth * dpr);
      h = canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      g.fillStyle = "#04040c";
      g.fillRect(0, 0, w, h);
    };
    resize();
    window.addEventListener("resize", resize);
    type P = { a: number; d: number; v: number; c: string; lw: number };
    const spawn = (p?: P): P => {
      const q = p ?? ({} as P);
      q.a = Math.random() * Math.PI * 2;
      q.d = 2 + Math.random() * 40;
      q.v = 0.012 + Math.random() * 0.03;
      q.c = Math.random() < 0.35 ? accentRef.current : PALETTE[Math.floor(Math.random() * PALETTE.length)]!;
      q.lw = 0.6 + Math.random() * 2.4;
      return q;
    };
    const parts: P[] = Array.from({ length: 260 }, () => { const p = spawn(); p.d = 2 + Math.random() * Math.max(w, h) * 0.6; return p; });
    const tick = () => {
      frame++;
      const cx = w * 0.5 + Math.sin(frame / 400) * w * 0.04, cy = h * 0.34 + Math.cos(frame / 500) * h * 0.03;
      const max = Math.hypot(w, h) * 0.75;
      g.globalCompositeOperation = "source-over";
      g.fillStyle = "rgba(4,4,14,0.11)"; // long exposure: older light fades slowly
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = "lighter";
      for (const p of parts) {
        const x0 = cx + Math.cos(p.a) * p.d, y0 = cy + Math.sin(p.a) * p.d * 0.62;
        p.d *= 1 + p.v * (1 + boost.current * 5);
        p.a += 0.0025; // the swirl
        const x1 = cx + Math.cos(p.a) * p.d, y1 = cy + Math.sin(p.a) * p.d * 0.62;
        const t = Math.min(1, p.d / max);
        g.strokeStyle = p.c;
        g.globalAlpha = 0.25 + t * 0.75;
        g.lineWidth = p.lw * (0.8 + t * 4) * (1 + boost.current * 0.6);
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        if (p.d > max) spawn(p);
      }
      // Bloom: a soft, blurred copy of the light on top of itself (every other frame keeps it cheap).
      if (frame % 2 === 0) {
        g.globalAlpha = 0.18;
        g.filter = "blur(14px)";
        g.drawImage(canvas, 0, 0);
        g.filter = "none";
      }
      g.globalAlpha = 1;
      boost.current *= 0.94;
      if (!reduce || frame < 90) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} aria-hidden className="absolute inset-0 h-full w-full [filter:saturate(1.5)_contrast(1.1)]" />;
}

export function Onboarding({ slides, finishLabel = "Let's go", onDone }: { slides: Slide[]; finishLabel?: string; onDone: () => void | Promise<void> }) {
  const [i, setI] = useState(0);
  const [closing, setClosing] = useState(false);
  const s = slides[i]!;
  const last = i === slides.length - 1;
  const finish = useCallback(async () => { setClosing(true); await onDone(); }, [onDone]);
  const next = useCallback(() => (last ? finish() : setI((x) => x + 1)), [last, finish]);
  const back = useCallback(() => setI((x) => Math.max(0, x - 1)), []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter") next();
      if (e.key === "ArrowLeft") back();
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, [next, back, finish]);

  return (
    <AnimatePresence>
      {!closing && (
        <motion.div role="dialog" aria-modal aria-label="Welcome" className="fixed inset-0 z-[120] overflow-hidden bg-[#04040c] text-white"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.04, filter: "blur(12px)" }} transition={{ duration: 0.6 }}>
          <motion.div className="absolute inset-0" initial={{ scale: 1.25, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 2.4, ease: [0.16, 1, 0.3, 1] }}>
            <LightTunnel accent={s.accent} step={i} />
          </motion.div>
          {/* Flash of light on every cut */}
          <AnimatePresence>
            <motion.div key={`flash-${i}`} className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(60% 45% at 50% 34%, color-mix(in srgb, ${s.accent} 55%, #fff) 0%, transparent 70%)` }}
              initial={{ opacity: i === 0 ? 0 : 0.55 }} animate={{ opacity: 0 }} transition={{ duration: 1.1, ease: "easeOut" }} />
          </AnimatePresence>
          {/* Colour grade, vignette, horizon glow and film grain */}
          <div className="pointer-events-none absolute inset-0 transition-[background] duration-1000"
            style={{ background: `radial-gradient(120% 70% at 50% 34%, transparent 0%, transparent 35%, rgba(4,4,12,.55) 70%, rgba(2,2,8,.95) 100%), linear-gradient(180deg, color-mix(in srgb, ${s.accent} 22%, transparent) 0%, transparent 40%, rgba(4,4,12,.75) 78%, #04040c 100%)` }} />
          {/* The bright core where the light comes from */}
          <div className="pointer-events-none absolute left-1/2 top-[34%] h-[38vh] w-[60vw] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-50 mix-blend-screen blur-[70px] transition-colors duration-1000"
            style={{ background: `radial-gradient(closest-side, #fff, color-mix(in srgb, ${s.accent} 60%, #fff) 45%, transparent)` }} />
          <div className="pointer-events-none absolute inset-x-[-10%] top-[58%] h-28 rounded-[100%] opacity-60 blur-3xl transition-colors duration-1000" style={{ background: s.accent }} />
          <div className="pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-overlay"
            style={{ backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")" }} />
          {/* Letterbox */}
          <motion.div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[7vh] bg-black" initial={{ y: "-100%" }} animate={{ y: 0 }} transition={{ duration: 1.2, delay: 0.2, ease: [0.65, 0, 0.35, 1] }} />
          <motion.div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[7vh] bg-black" initial={{ y: "100%" }} animate={{ y: 0 }} transition={{ duration: 1.2, delay: 0.2, ease: [0.65, 0, 0.35, 1] }} />
          <div className="pointer-events-none absolute inset-x-0 top-[7vh] h-[10vh] bg-gradient-to-b from-black/80 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-[7vh] h-[16vh] bg-gradient-to-t from-black/80 to-transparent" />

          <div className="relative z-30 flex h-full flex-col px-6 pb-[8vh] pt-[8vh] sm:px-12">
            <div className="flex items-center justify-between">
              <LogLogo className="h-8 text-white" />
              <button onClick={finish} className="rounded-full border border-white/20 px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-white/70 backdrop-blur transition hover:border-white/50 hover:text-white">Skip</button>
            </div>

            <div className="mt-auto max-w-3xl pb-6">
              <AnimatePresence mode="wait">
                <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1, scale: [1, 1.025] }} exit={{ opacity: 0, y: -18, filter: "blur(10px)" }}
                  transition={{ opacity: { duration: 0.4 }, scale: { duration: 12, ease: "linear" }, default: { duration: 0.5 } }} style={{ transformOrigin: "left bottom" }}>
                  <motion.div className="mb-4 flex items-center gap-3 text-[11px] font-semibold uppercase text-white/60"
                    initial={{ opacity: 0, letterSpacing: "0.9em" }} animate={{ opacity: 1, letterSpacing: "0.35em" }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}>
                    <motion.span className="h-px" style={{ background: s.accent }} initial={{ width: 0 }} animate={{ width: 40 }} transition={{ duration: 0.8, delay: 0.2 }} />{s.eyebrow}
                  </motion.div>
                  <h1 aria-label={s.title} style={{ perspective: 800 }} className="font-display text-5xl font-extrabold uppercase leading-[0.9] tracking-tight drop-shadow-[0_4px_30px_rgba(0,0,0,.6)] sm:text-7xl lg:text-8xl">
                    {s.title.split(" ").map((word, k) => (
                      <motion.span key={k} aria-hidden className="inline-block pr-[0.22em]"
                        style={{ backgroundImage: `linear-gradient(100deg, #fff 30%, color-mix(in srgb, ${s.accent} 75%, #fff) 100%)`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}
                        initial={{ opacity: 0, y: "0.6em", filter: "blur(14px)", rotateX: -60 }} animate={{ opacity: 1, y: 0, filter: "blur(0px)", rotateX: 0 }}
                        transition={{ duration: 0.9, delay: 0.15 + k * 0.09, ease: [0.22, 1, 0.36, 1] }}>{word}</motion.span>
                    ))}
                  </h1>
                  <motion.p className="mt-5 max-w-xl text-base leading-relaxed text-white/80 sm:text-lg"
                    initial={{ opacity: 0, y: 14, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.8, delay: 0.45 }}>{s.body}</motion.p>
                  {s.points && (
                    <ul className="mt-6 grid max-w-2xl gap-2 sm:grid-cols-2">
                      {s.points.map((p, k) => (
                        <motion.li key={p} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.7 + k * 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                          className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/85 backdrop-blur-md">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: s.accent, boxShadow: `0 0 12px ${s.accent}` }} />{p}
                        </motion.li>
                      ))}
                    </ul>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex flex-1 gap-1.5" aria-label={`Step ${i + 1} of ${slides.length}`}>
                {slides.map((x, k) => (
                  <button key={k} onClick={() => setI(k)} aria-label={`Go to step ${k + 1}`} className="h-6 flex-1 py-2.5">
                    <span className="block h-1 overflow-hidden rounded-full bg-white/15">
                      <span className={cn("block h-full rounded-full transition-all duration-500", k <= i ? "w-full" : "w-0")} style={{ background: k === i ? s.accent : "rgba(255,255,255,.7)" }} />
                    </span>
                  </button>
                ))}
              </div>
              <button onClick={back} disabled={i === 0} aria-label="Back" className="grid h-11 w-11 place-items-center rounded-full border border-white/20 text-white/80 transition hover:border-white/50 disabled:opacity-0"><ArrowLeft className="h-4 w-4" /></button>
              <button onClick={next} className="inline-flex h-11 items-center gap-2 rounded-full px-6 text-sm font-semibold text-black shadow-[0_0_40px_-6px] transition hover:scale-[1.03]"
                style={{ background: `linear-gradient(90deg, #fff, color-mix(in srgb, ${s.accent} 45%, #fff))`, boxShadow: `0 0 40px -8px ${s.accent}` }}>
                {last ? finishLabel : "Next"} <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
