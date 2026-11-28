"use client";
// Ported from the Base44 site (LOG — Lots Of Growth).
import { useEffect, useState, useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";

export default function HeroSection() {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const ref = useRef(null);
  const { scrollY } = useScroll();
  const bgY = useTransform(scrollY, [0, 600], [0, 120]);
  const textY = useTransform(scrollY, [0, 600], [0, 80]);
  const opacity = useTransform(scrollY, [0, 400], [1, 0]);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      setMousePos({
        x: (e.clientX / window.innerWidth - 0.5) * 20,
        y: (e.clientY / window.innerHeight - 0.5) * 20,
      });
    };
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, []);

  const scrollTo = (id: string) => document.querySelector(id)?.scrollIntoView({ behavior: 'smooth' });
  const words = ['WE', 'BUILD', 'WHAT', 'LASTS'];

  return (
    <section ref={ref} className="relative h-screen w-full overflow-hidden bg-log-black">
      {/* Parallax background */}
      <motion.div
        className="absolute inset-0"
        style={{
          y: bgY,
          x: mousePos.x * 0.4,
          scale: 1.15,
        }}
        transition={{ type: 'tween', duration: 0.08 }}
      >
        <img
          src="https://images.unsplash.com/photo-1486325212027-8081e485255e?w=1800&q=80"
          alt=""
          className="w-full h-full object-cover"
          style={{ filter: 'brightness(0.3) contrast(1.3) saturate(0.7)' }}
        />
      </motion.div>

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-b from-log-black/70 via-log-black/10 to-log-black" />
      <div className="absolute inset-0 bg-gradient-to-r from-log-black/50 via-transparent to-log-black/50" />

      {/* Moving ambient glows */}
      <motion.div
        className="absolute pointer-events-none"
        animate={{ x: [0, 40, 0], y: [0, -30, 0], opacity: [0.15, 0.3, 0.15] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        style={{ top: '20%', left: '15%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(193,57,43,0.25) 0%, transparent 70%)', filter: 'blur(80px)' }}
      />
      <motion.div
        className="absolute pointer-events-none"
        animate={{ x: [0, -30, 0], y: [0, 40, 0], opacity: [0.1, 0.2, 0.1] }}
        transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        style={{ bottom: '25%', right: '10%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(32,79,144,0.2) 0%, transparent 70%)', filter: 'blur(100px)' }}
      />

      {/* Fine grid */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '80px 80px' }} />

      {/* Main content */}
      <motion.div
        style={{ y: textY, opacity }}
        className="relative z-10 h-full flex flex-col items-center justify-center px-4 text-center"
      >
        <motion.p
          initial={{ opacity: 0, letterSpacing: '0.2em' }}
          animate={{ opacity: 1, letterSpacing: '0.5em' }}
          transition={{ delay: 0.3, duration: 1.2 }}
          className="text-log-pearl/40 text-[10px] font-semibold uppercase mb-10"
        >
          Marketing Agency
        </motion.p>

        {/* Headline */}
        <div className="overflow-hidden">
          <div className="flex flex-wrap justify-center gap-x-[2vw]">
            {words.map((word, i) => (
              <div key={word} className="overflow-hidden">
                <motion.span
                  initial={{ y: '110%', opacity: 0 }}
                  animate={{ y: '0%', opacity: 1 }}
                  transition={{ delay: 0.4 + i * 0.13, duration: 1.0, ease: [0.85, 0, 0.15, 1] }}
                  className="block text-log-pearl font-black leading-[0.88] tracking-tighter"
                  style={{ fontSize: 'clamp(3.5rem, 13vw, 10rem)' }}
                >
                  {word}
                </motion.span>
              </div>
            ))}
          </div>
        </div>

        {/* Animated red line */}
        <motion.div
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ delay: 1.0, duration: 1.0, ease: [0.85, 0, 0.15, 1] }}
          className="w-16 h-[2px] bg-log-red mt-8 mb-10 origin-left"
        />

        {/* Subtext */}
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 0.8 }}
          className="text-log-pearl/30 text-xs md:text-sm tracking-[0.15em] uppercase mb-10 max-w-md"
        >
          Full-Spectrum Marketing · We Build What Lasts
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.3, duration: 0.7 }}
          className="flex flex-col sm:flex-row gap-4"
        >
          <button
            onClick={() => scrollTo('#contact')}
            className="group relative px-10 py-4 text-log-pearl text-xs font-bold tracking-[0.25em] uppercase overflow-hidden min-w-[200px]"
            style={{ border: '1px solid rgba(193,57,43,0.6)' }}
          >
            <motion.span
              className="absolute inset-0 bg-log-red"
              initial={{ x: '-100%' }}
              whileHover={{ x: '0%' }}
              transition={{ duration: 0.5, ease: [0.85, 0, 0.15, 1] }}
            />
            <span className="relative z-10">Book a Meeting</span>
          </button>
          <button
            onClick={() => scrollTo('#services')}
            className="group relative px-10 py-4 text-log-pearl text-xs font-bold tracking-[0.25em] uppercase overflow-hidden min-w-[200px]"
            style={{ border: '1px solid rgba(253,253,246,0.15)' }}
          >
            <motion.span
              className="absolute inset-0"
              style={{ backgroundColor: 'rgba(253,253,246,0.05)' }}
              initial={{ x: '-100%' }}
              whileHover={{ x: '0%' }}
              transition={{ duration: 0.5, ease: [0.85, 0, 0.15, 1] }}
            />
            <span className="relative z-10">Our Services</span>
          </button>
        </motion.div>
      </motion.div>

      {/* Scroll cue */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.2 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3"
      >
        <span className="text-log-pearl/20 text-[9px] tracking-[0.5em] uppercase">Scroll</span>
        <div className="w-[1px] h-10 bg-gradient-to-b from-log-pearl/20 to-transparent overflow-hidden relative">
          <motion.div
            className="absolute inset-x-0 top-0 h-4 bg-log-pearl/50"
            animate={{ y: ['-100%', '300%'] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </motion.div>

      {/* Bottom wave */}
      <div className="absolute bottom-0 left-0 right-0 overflow-hidden pointer-events-none" style={{ height: 80 }}>
        <svg viewBox="0 0 1440 80" preserveAspectRatio="none" className="w-full h-full">
          <path d="M0,40 C360,80 1080,0 1440,40 L1440,80 L0,80 Z" fill="#FDFDF6" opacity="0.03" />
        </svg>
      </div>
    </section>
  );
}