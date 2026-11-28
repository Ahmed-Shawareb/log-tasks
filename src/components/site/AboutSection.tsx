"use client";
// Ported from the Base44 site (LOG — Lots Of Growth).
import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";

export default function AboutSection() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const imgY = useTransform(scrollYProgress, [0, 1], ['-8%', '8%']);
  const glowX = useTransform(scrollYProgress, [0, 1], ['-20%', '20%']);

  return (
    <section id="about" ref={ref} className="relative bg-log-pearl py-28 md:py-44 overflow-hidden">
      {/* Ambient blobs */}
      <motion.div
        style={{ x: glowX, background: 'radial-gradient(circle, rgba(193,57,43,0.04) 0%, transparent 70%)', filter: 'blur(80px)' }}
        className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full pointer-events-none"
      />

      <div className="max-w-[1440px] mx-auto px-6 md:px-12">
        <motion.div
          initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.7 }}
          className="flex items-center gap-4 mb-16"
        >
          <div className="w-10 h-[1px] bg-log-red" />
          <span className="text-[10px] font-semibold tracking-[0.3em] uppercase text-log-grey">About LOG</span>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-12 md:gap-20 items-center">
          {/* Image column with parallax */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 1.0, ease: [0.85, 0, 0.15, 1] }}
            className="relative"
          >
            {/* Floating glow behind image */}
            <div className="absolute -inset-10 rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(ellipse, rgba(193,57,43,0.08) 0%, transparent 70%)', filter: 'blur(50px)' }} />

            {/* Decorative frame */}
            <div className="absolute -top-5 -left-5 w-3/4 h-3/4 border border-log-red/10 pointer-events-none z-0" />
            <div className="absolute -bottom-5 -right-5 w-3/4 h-3/4 border border-log-black/8 pointer-events-none z-0" />

            <div className="relative overflow-hidden" style={{ aspectRatio: '3/4' }}>
              <motion.img
                src="https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=900&q=80"
                alt="LOG Creative Agency"
                className="w-full h-full object-cover"
                style={{ y: imgY, scale: 1.12 }}
                whileHover={{ scale: 1.04 }}
                transition={{ duration: 0.8 }}
              />
              {/* Glass overlay on image */}
              <div className="absolute inset-0 bg-gradient-to-tr from-log-black/20 via-transparent to-log-red/5 pointer-events-none" />
            </div>

            {/* Floating badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.6, duration: 0.6 }}
              className="absolute -bottom-6 -right-4 md:-right-8 px-5 py-4 bg-log-black"
              style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
            >
              <p className="text-2xl font-black text-log-pearl">3×</p>
              <p className="text-[10px] font-medium tracking-[0.2em] uppercase text-log-pearl/40 mt-1">Avg. ROI</p>
            </motion.div>
          </motion.div>

          {/* Text column */}
          <div className="relative">
            <motion.h2
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.9, ease: [0.85, 0, 0.15, 1], delay: 0.15 }}
              className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter text-log-black leading-[0.95] mb-8"
            >
              Growth is<br />not a{' '}
              <span className="relative inline-block">
                <span className="text-log-red">trend.</span>
                <motion.div
                  className="absolute -bottom-1 left-0 h-[2px] bg-log-red/30 origin-left"
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.8, duration: 0.8 }}
                  style={{ width: '100%' }}
                />
              </span>
              <br />It's a system.
            </motion.h2>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.3 }}
              className="space-y-4 mb-10"
            >
              <p className="text-sm md:text-base text-log-grey leading-relaxed">
                LOG — Lots Of Growth is a full-spectrum marketing agency that builds lasting brand
                ecosystems. We don't do quick fixes. We engineer growth architectures that compound over time.
              </p>
              <p className="text-sm md:text-base text-log-grey leading-relaxed">
                From cinematic content production to performance-driven media buying, every project is
                a strategic investment in your future.
              </p>
            </motion.div>

            {/* Stats row */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.45 }}
              className="grid grid-cols-3 gap-6 pt-8"
              style={{ borderTop: '1px solid rgba(0,0,0,0.08)' }}
            >
              {[['150+', 'Campaigns'], ['50M+', 'Reach'], ['98%', 'Retention']].map(([num, lbl]) => (
                <div key={lbl} className="text-center">
                  <motion.span
                    className="text-2xl md:text-3xl font-black text-log-black block"
                    whileInView={{ opacity: [0, 1] }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                  >
                    {num}
                  </motion.span>
                  <p className="text-[10px] font-medium tracking-[0.2em] uppercase text-log-grey mt-1">{lbl}</p>
                </div>
              ))}
            </motion.div>

            {/* CTA */}
            <motion.button
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.6, duration: 0.7 }}
              onClick={() => document.querySelector('#contact')?.scrollIntoView({ behavior: 'smooth' })}
              className="group relative mt-10 px-8 py-4 text-xs font-bold tracking-[0.2em] uppercase text-log-pearl bg-log-black overflow-hidden"
              whileHover={{ scale: 1.02 }}
            >
              <motion.span
                className="absolute inset-0 bg-log-red"
                initial={{ x: '-100%' }}
                whileHover={{ x: '0%' }}
                transition={{ duration: 0.5, ease: [0.85, 0, 0.15, 1] }}
              />
              <span className="relative">Start a Project</span>
            </motion.button>
          </div>
        </div>
      </div>

      {/* Curved bottom transition */}
      <div className="absolute bottom-0 left-0 right-0 overflow-hidden pointer-events-none" style={{ height: 80 }}>
        <svg viewBox="0 0 1440 80" preserveAspectRatio="none" className="w-full h-full">
          <path d="M0,0 C480,80 960,80 1440,0 L1440,80 L0,80 Z" fill="#000000" opacity="1" />
        </svg>
      </div>
    </section>
  );
}