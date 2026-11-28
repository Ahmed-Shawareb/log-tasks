"use client";
// Ported from the Base44 site (LOG — Lots Of Growth).
import { motion } from "motion/react";

const items = [
  'WE BUILD WHAT LASTS',
  'UGC CONTENT',
  'MEDIA PRODUCTION',
  'PERFORMANCE MARKETING',
  'BRANDING & STRATEGY',
  'SOCIAL MEDIA',
  'CONTENT CREATION',
];

export default function MarqueeBand({ dark = false, reverse = false }) {
  return (
    <div className={`relative py-5 overflow-hidden ${dark ? 'bg-log-black' : 'bg-log-black'}`}>
      {/* Subtle gradient edges */}
      <div className="absolute inset-y-0 left-0 w-24 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(to right, rgba(0,0,0,0.6), transparent)' }} />
      <div className="absolute inset-y-0 right-0 w-24 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(to left, rgba(0,0,0,0.6), transparent)' }} />

      <motion.div
        animate={{ x: reverse ? ['-50%', '0%'] : ['0%', '-50%'] }}
        transition={{ duration: 25, ease: 'linear', repeat: Infinity }}
        className="flex gap-0 whitespace-nowrap"
        style={{ width: 'max-content' }}
      >
        {[...items, ...items].map((item, i) => (
          <span key={i} className="inline-flex items-center gap-5 px-5">
            <span className="text-[11px] font-bold tracking-[0.35em] uppercase text-log-pearl/50">{item}</span>
            <span className="text-log-red" style={{ fontSize: 10 }}>✦</span>
          </span>
        ))}
      </motion.div>
    </div>
  );
}