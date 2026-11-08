"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { LogLogo } from "./logo";
import { cn } from "@/lib/utils";

// First-time welcome screens: full-screen, cinematic and calm — deep colours and slow, silky ribbons of light
// that build up like a long-exposure photograph. Always dark, whatever the app theme.

export type Slide = { eyebrow: string; title: string; body: string; points?: string[]; accent: string };

const PALETTE = ["#5b4bff", "#2fb7d6", "#c2417a", "#d99a4e", "#8f7bff", "#e8e6ff"];

/** Slow light ribbons drifting along a flowing field. Each new screen gently turns the flow. */
function LightRibbons({ accent, step }: { accent: string; step: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const accentRef = useRef(accent);
  accentRef.current = accent;
  const target = useRef(0);
  useEffect(() => { target.current = step * 1.3; }, [step]);
  useEffect(() => {
    const canvas = ref.current!;
    const g = canvas.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, dpr = 1, raf = 0, last = performance.now(), t = 0, phase = 0, frame = 0;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.width = Math.floor(window.innerWidth * dpr);
      h = canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      g.fillStyle = "#03030a";
      g.fillRect(0, 0, w, h);
    };
    resize();
    window.addEventListener("resize", resize);
    type P = { x: number; y: number; c: string; lw: number; life: number; speed: number };
    const spawn = (p?: P): P => {
      const q = p ?? ({} as P);
      q.x = Math.random() * w; q.y = h * (0.15 + Math.random() * 0.7);
      q.c = Math.random() < 0.4 ? accentRef.current : PALETTE[Math.floor(Math.random() * PALETTE.length)]!;
      q.lw = (0.8 + Math.random() * 2.2) * dpr;
      q.life = 300 + Math.random() * 600;
      q.speed = (0.35 + Math.random() * 0.55) * dpr;
      return q;
    };
    const parts: P[] = Array.from({ length: 150 }, () => spawn());
    const step = (now: number) => {
      const dt = Math.min(3, (now - last) / 16.7); // frame-rate independent
      last = now; t += 0.0016 * dt; frame++;
      phase += (target.current - phase) * 0.012 * dt; // ease toward the new screen's flow
      g.globalCompositeOperation = "source-over";
      g.fillStyle = "rgba(3,3,10,0.03)"; // very long exposure
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = "lighter";
      const f = 1.6 / Math.max(w, h);
      for (const p of parts) {
        const a = Math.sin(p.x * f * 2.2 + t + phase) * 1.1 + Math.cos(p.y * f * 3.1 - t * 0.8 + phase * 0.6) * 0.9 - 0.15;
        const nx = p.x + Math.cos(a) * p.speed * dt, ny = p.y + Math.sin(a) * p.speed * 0.55 * dt;
        g.strokeStyle = p.c;
        g.globalAlpha = 0.28;
        g.lineWidth = p.lw;
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(nx, ny); g.stroke();
        p.x = nx; p.y = ny; p.life -= dt;
        if (p.life <= 0 || p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) spawn(p);
      }
      // Soft bloom, now and then.
      if (frame % 6 === 0) {
        g.globalAlpha = 0.16;
        g.filter = "blur(16px)";
        g.drawImage(canvas, 0, 0);
        g.filter = "none";
      }
      g.globalAlpha = 1;
    };
    const loop = (now: number) => { step(now); raf = requestAnimationFrame(loop); };
    // Expose for a moment before the first frame, so the ribbons are already there when the screen fades in.
    for (let k = 0, t0 = last; k < (reduce ? 400 : 160); k++) step(t0 + 16.7 * (k + 1));
    last = performance.now();
    if (!reduce) raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} aria-hidden className="absolute inset-0 h-full w-full [filter:saturate(1.25)_contrast(1.05)]" />;
}

export function Onboarding({ slides, finishLabel = "Let's go", onDone, logo = true }: { slides: Slide[]; finishLabel?: string; onDone: () => void | Promise<void>; logo?: boolean }) {
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
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.03, filter: "blur(12px)" }} transition={{ duration: 1 }}>
          <motion.div className="absolute inset-0" initial={{ scale: 1.12, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 4, ease: [0.16, 1, 0.3, 1] }}>
            <LightRibbons accent={s.accent} step={i} />
          </motion.div>
          {/* Flash of light on every cut */}
          <AnimatePresence>
            <motion.div key={`flash-${i}`} className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(60% 45% at 50% 34%, color-mix(in srgb, ${s.accent} 55%, #fff) 0%, transparent 70%)` }}
              initial={{ opacity: i === 0 ? 0 : 0.22 }} animate={{ opacity: 0 }} transition={{ duration: 2.2, ease: "easeOut" }} />
          </AnimatePresence>
          {/* Colour grade, vignette, horizon glow and film grain */}
          <div className="pointer-events-none absolute inset-0 transition-[background] duration-1000"
            style={{ background: `radial-gradient(120% 70% at 50% 34%, transparent 0%, transparent 35%, rgba(4,4,12,.55) 70%, rgba(2,2,8,.95) 100%), linear-gradient(180deg, color-mix(in srgb, ${s.accent} 22%, transparent) 0%, transparent 40%, rgba(4,4,12,.75) 78%, #04040c 100%)` }} />
          {/* A deep, slow-breathing glow and an anamorphic lens flare drifting across the frame */}
          <motion.div className="pointer-events-none absolute left-1/2 top-[38%] h-[55vh] w-[80vw] -translate-x-1/2 -translate-y-1/2 rounded-full mix-blend-screen blur-[90px]"
            style={{ background: `radial-gradient(closest-side, color-mix(in srgb, ${s.accent} 55%, transparent), transparent)` }}
            animate={{ opacity: [0.35, 0.55, 0.35], scale: [1, 1.06, 1] }} transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }} />
          <motion.div className="pointer-events-none absolute top-[40%] h-[2px] w-[70vw] mix-blend-screen blur-[1.5px]"
            style={{ background: `linear-gradient(90deg, transparent, color-mix(in srgb, ${s.accent} 60%, #fff) 50%, transparent)` }}
            initial={{ left: "-70vw", opacity: 0 }} animate={{ left: ["-70vw", "100vw"], opacity: [0, 0.7, 0] }} transition={{ duration: 14, repeat: Infinity, ease: "easeInOut", repeatDelay: 2 }} />
          <div className="pointer-events-none absolute inset-x-[-10%] top-[62%] h-24 rounded-[100%] opacity-30 blur-3xl transition-colors duration-[2000ms]" style={{ background: s.accent }} />
          <div className="pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-overlay"
            style={{ backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")" }} />
          {/* Letterbox */}
          <motion.div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[7vh] bg-black" initial={{ y: "-100%" }} animate={{ y: 0 }} transition={{ duration: 1.2, delay: 0.2, ease: [0.65, 0, 0.35, 1] }} />
          <motion.div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[7vh] bg-black" initial={{ y: "100%" }} animate={{ y: 0 }} transition={{ duration: 1.2, delay: 0.2, ease: [0.65, 0, 0.35, 1] }} />
          <div className="pointer-events-none absolute inset-x-0 top-[7vh] h-[10vh] bg-gradient-to-b from-black/80 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-[7vh] h-[16vh] bg-gradient-to-t from-black/80 to-transparent" />

          <div className="relative z-30 flex h-full flex-col px-6 pb-[8vh] pt-[8vh] sm:px-12">
            <div className="flex items-center justify-between">
              {logo ? <LogLogo className="h-8 text-white" /> : <span />}
              <button onClick={finish} className="rounded-full border border-white/20 px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-white/70 backdrop-blur transition hover:border-white/50 hover:text-white">Skip</button>
            </div>

            <div className="mt-auto max-w-3xl pb-6">
              <AnimatePresence mode="wait">
                <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1, scale: [1, 1.025] }} exit={{ opacity: 0, y: -18, filter: "blur(10px)" }}
                  transition={{ opacity: { duration: 0.8 }, scale: { duration: 20, ease: "linear" }, default: { duration: 0.8 } }} style={{ transformOrigin: "left bottom" }}>
                  <motion.div className="mb-4 flex items-center gap-3 text-[11px] font-semibold uppercase text-white/60"
                    initial={{ opacity: 0, letterSpacing: "0.9em" }} animate={{ opacity: 1, letterSpacing: "0.35em" }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}>
                    <motion.span className="h-px" style={{ background: s.accent }} initial={{ width: 0 }} animate={{ width: 40 }} transition={{ duration: 0.8, delay: 0.2 }} />{s.eyebrow}
                  </motion.div>
                  <h1 aria-label={s.title} style={{ perspective: 800 }} className="font-display text-5xl font-extrabold uppercase leading-[0.9] tracking-tight drop-shadow-[0_4px_30px_rgba(0,0,0,.6)] sm:text-7xl lg:text-8xl">
                    {s.title.split(" ").map((word, k) => (
                      <motion.span key={k} aria-hidden className="inline-block pr-[0.22em]"
                        style={{ backgroundImage: `linear-gradient(100deg, #fff 30%, color-mix(in srgb, ${s.accent} 75%, #fff) 100%)`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}
                        initial={{ opacity: 0, y: "0.4em", filter: "blur(16px)", rotateX: -30 }} animate={{ opacity: 1, y: 0, filter: "blur(0px)", rotateX: 0 }}
                        transition={{ duration: 1.4, delay: 0.25 + k * 0.14, ease: [0.22, 1, 0.36, 1] }}>{word}</motion.span>
                    ))}
                  </h1>
                  <motion.p className="mt-5 max-w-xl text-base leading-relaxed text-white/80 sm:text-lg"
                    initial={{ opacity: 0, y: 14, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 1.3, delay: 0.8 }}>{s.body}</motion.p>
                  {s.points && (
                    <ul className="mt-6 grid max-w-2xl gap-2 sm:grid-cols-2">
                      {s.points.map((p, k) => (
                        <motion.li key={p} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.2 + k * 0.15, duration: 1, ease: [0.22, 1, 0.36, 1] }}
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
