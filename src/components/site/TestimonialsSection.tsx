"use client";
// Ported from the Base44 site (LOG — Lots Of Growth).
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";

const testimonials = [
  {
    quote: "LOG transformed our entire digital presence. Their strategic approach to content and performance marketing delivered 4x our previous ROI within the first quarter.",
    name: 'Sarah Mitchell',
    title: 'CMO, Vertex Labs',
    img: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&q=80',
  },
  {
    quote: "Working with LOG feels like having an in-house creative department with the precision of a data science team. They don't just create — they engineer growth.",
    name: 'David Chen',
    title: 'Founder, Ascend Studio',
    img: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&q=80',
  },
  {
    quote: "The media production quality was beyond anything we expected. LOG understands that brand perception is everything in our market.",
    name: 'Amara Obi',
    title: 'Director of Brand, Helios Group',
    img: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=200&q=80',
  },
];

export default function TestimonialsSection() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setCurrent(c => (c + 1) % testimonials.length), 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="relative bg-log-black py-24 md:py-36 overflow-hidden">
      {/* Background visual */}
      <div className="absolute inset-0 opacity-5 pointer-events-none">
        <img
          src="https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=1600&q=60"
          alt=""
          className="w-full h-full object-cover"
          style={{ filter: 'grayscale(1)' }}
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-log-black via-transparent to-log-black pointer-events-none" />

      {/* Glow */}
      <motion.div
        key={current}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
        style={{ background: 'radial-gradient(ellipse, rgba(193,57,43,0.06) 0%, transparent 70%)', filter: 'blur(60px)' }}
      />

      <div className="relative z-10 max-w-[1440px] mx-auto px-6 md:px-12">
        <motion.div
          initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.7 }}
          className="flex items-center gap-4 mb-16"
        >
          <div className="w-10 h-[1px] bg-log-red" />
          <span className="text-[10px] font-semibold tracking-[0.3em] uppercase text-log-pearl/40">Client Voices</span>
        </motion.div>

        <div className="grid lg:grid-cols-5 gap-12 md:gap-16 items-center">
          {/* Quote */}
          <div className="lg:col-span-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={current}
                initial={{ opacity: 0, y: 30, filter: 'blur(8px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -20, filter: 'blur(4px)' }}
                transition={{ duration: 0.7, ease: [0.85, 0, 0.15, 1] }}
              >
                <span className="block text-6xl md:text-8xl font-black text-log-red/12 leading-none mb-[-2rem]">"</span>
                <blockquote className="text-xl md:text-3xl lg:text-4xl font-bold tracking-tight text-log-pearl leading-snug mb-8">
                  {testimonials[current].quote}
                </blockquote>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full overflow-hidden border border-log-pearl/10">
                    <img src={testimonials[current].img} alt={testimonials[current].name} className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-log-pearl">{testimonials[current].name}</p>
                    <p className="text-xs text-log-pearl/40 mt-0.5">{testimonials[current].title}</p>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Navigation dots */}
          <div className="lg:col-span-1 flex lg:flex-col gap-3 lg:gap-4 items-center lg:items-end">
            {testimonials.map((t, i) => (
              <button key={i} onClick={() => setCurrent(i)} className="group relative flex items-center gap-2">
                <motion.div
                  className="rounded-full transition-all duration-500"
                  animate={{
                    width: i === current ? 40 : 8,
                    height: 3,
                    backgroundColor: i === current ? '#C1392B' : 'rgba(253,253,246,0.15)',
                  }}
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}