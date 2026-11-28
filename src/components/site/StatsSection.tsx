"use client";
// Ported from the Base44 site (LOG — Lots Of Growth).
import { useState, useEffect, useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";

const stats = [
  { value: 150, suffix: '+', label: 'Campaigns Delivered', color: '#C1392B' },
  { value: 50, suffix: 'M+', label: 'People Reached', color: '#204F90' },
  { value: 300, suffix: '%', label: 'Average Growth', color: '#C1392B' },
  { value: 40, suffix: '+', label: 'Active Partners', color: '#204F90' },
];

function Counter({ target, suffix, color, start }: { target: number; suffix: string; color: string; start: boolean }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!start) return;
    let frame = 0;
    const total = 90;
    const timer = setInterval(() => {
      frame++;
      const eased = 1 - Math.pow(1 - frame / total, 3);
      setCount(Math.round(eased * target));
      if (frame >= total) { setCount(target); clearInterval(timer); }
    }, 18);
    return () => clearInterval(timer);
  }, [start, target]);

  return <span style={{ color }}>{count}{suffix}</span>;
}

export default function StatsSection() {
  const [started, setStarted] = useState(false);
  const ref = useRef(null);
  const sectionRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start end', 'end start'] });
  const bgY = useTransform(scrollYProgress, [0, 1], ['-5%', '5%']);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setStarted(true); observer.disconnect(); } },
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="relative bg-log-black py-24 md:py-36 overflow-hidden">
      {/* Parallax bg image */}
      <motion.div
        className="absolute inset-0 opacity-10"
        style={{ y: bgY }}
      >
        <img
          src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1600&q=60"
          alt=""
          className="w-full h-full object-cover"
          style={{ filter: 'grayscale(1) contrast(1.2)' }}
        />
      </motion.div>
      <div className="absolute inset-0 bg-gradient-to-b from-log-black via-log-black/80 to-log-black" />

      {/* Glows */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(193,57,43,0.07) 0%, transparent 70%)', filter: 'blur(80px)' }} />

      <div ref={ref} className="relative z-10 max-w-[1440px] mx-auto px-6 md:px-12">
        <motion.div
          initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.7 }}
          className="flex items-center gap-4 mb-10"
        >
          <div className="w-10 h-[1px] bg-log-red" />
          <span className="text-[10px] font-semibold tracking-[0.3em] uppercase text-log-pearl/40">The Numbers</span>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.1 }}
          className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tighter text-log-pearl leading-[0.9] mb-16 md:mb-24"
        >
          Numbers don't<br />
          <span className="text-log-red">lie.</span>
        </motion.h2>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-0">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: 0.2 + i * 0.12 }}
              className="lg:px-12 lg:border-r lg:border-log-pearl/5 last:border-0 relative group"
            >
              {/* Hover glow */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
                style={{ background: `radial-gradient(ellipse at 50% 100%, ${stat.color}15 0%, transparent 70%)` }} />

              <div className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter mb-3">
                <Counter target={stat.value} suffix={stat.suffix} color={stat.color} start={started} />
              </div>
              <p className="text-[10px] md:text-xs font-medium tracking-[0.25em] uppercase text-log-pearl/30">
                {stat.label}
              </p>

              {/* Animated bar */}
              <motion.div
                className="mt-4 h-[1px] origin-left"
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1.2, delay: 0.4 + i * 0.15 }}
                style={{ backgroundColor: stat.color, opacity: 0.4 }}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}