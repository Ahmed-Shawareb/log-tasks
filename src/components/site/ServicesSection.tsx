"use client";
// Ported from the Base44 site (LOG — Lots Of Growth).
import { useState, useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";

const services = [
  {
    num: '01',
    title: 'UGC Content',
    desc: 'Authentic creator-led content that converts. Real voices engineered for viral momentum.',
    accent: '#C1392B',
    bg: 'https://images.unsplash.com/photo-1616587226960-4a03badbe8bf?w=900&q=80',
    tag: 'Creator Economy',
    highlights: ['Viral Reels', 'Creator Network', 'Platform-Native'],
  },
  {
    num: '02',
    title: 'Content Creation',
    desc: 'Premium visual storytelling that elevates every brand touchpoint into a cinematic moment.',
    accent: '#204F90',
    bg: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=900&q=80',
    tag: 'Visual Storytelling',
    highlights: ['Art Direction', 'Editorial Design', 'Motion Graphics'],
  },
  {
    num: '03',
    title: 'Media Production',
    desc: 'Cinematic-grade production for brands that demand excellence. Every frame intentional.',
    accent: '#C1392B',
    bg: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=900&q=80',
    tag: 'Cinematic Grade',
    highlights: ['4K Production', 'Color Grading', 'Sound Design'],
  },
  {
    num: '04',
    title: 'Performance Marketing',
    desc: 'Data-driven campaigns that compound. Every dollar engineered for maximum return.',
    accent: '#204F90',
    bg: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=900&q=80',
    tag: 'ROI Engineering',
    highlights: ['Paid Media', 'A/B Testing', 'Analytics Dashboards'],
  },
  {
    num: '05',
    title: 'Branding & Strategy',
    desc: 'Identity systems that define categories. Brand architecture built for market dominance.',
    accent: '#C1392B',
    bg: 'https://images.unsplash.com/photo-1634942537034-2531766767d1?w=900&q=80',
    tag: 'Identity Systems',
    highlights: ['Brand DNA', 'Visual Identity', 'Market Positioning'],
  },
  {
    num: '06',
    title: 'Social Media Management',
    desc: 'Full-spectrum social ecosystems. Turning communities into loyal brand advocates.',
    accent: '#204F90',
    bg: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=900&q=80',
    tag: 'Community Growth',
    highlights: ['Daily Management', 'Growth Strategy', 'Influencer Relations'],
  },
];

function ServiceCard({ service, index }: { service: (typeof services)[number]; index: number }) {
  const [hovered, setHovered] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 150, damping: 20 });
  const springY = useSpring(y, { stiffness: 150, damping: 20 });

  const handleMouse = (e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    x.set((e.clientX - rect.left - rect.width / 2) * 0.08);
    y.set((e.clientY - rect.top - rect.height / 2) * 0.08);
  };
  const resetMouse = () => { x.set(0); y.set(0); };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.8, delay: index * 0.1, ease: [0.85, 0, 0.15, 1] }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); resetMouse(); }}
      onMouseMove={handleMouse}
      style={{ x: springX, y: springY }}
      className="group relative overflow-hidden cursor-pointer rounded-none"
    >
      {/* Background image */}
      <div className="relative h-[280px] md:h-[340px] overflow-hidden">
        <motion.img
          src={service.bg}
          alt={service.title}
          className="w-full h-full object-cover"
          animate={{ scale: hovered ? 1.08 : 1 }}
          transition={{ duration: 0.9, ease: [0.85, 0, 0.15, 1] }}
          style={{ filter: hovered ? 'brightness(0.25) saturate(0.6)' : 'brightness(0.15) saturate(0.4)' }}
        />
        {/* Glow */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          animate={{ opacity: hovered ? 1 : 0 }}
          transition={{ duration: 0.6 }}
          style={{ background: `radial-gradient(ellipse at 30% 60%, ${service.accent}55 0%, transparent 70%)` }}
        />
        {/* Content overlay */}
        <div className="absolute inset-0 flex flex-col justify-between p-8 md:p-10">
          {/* Top row */}
          <div className="flex items-start justify-between">
            <motion.span
              className="text-[10px] font-bold tracking-[0.35em] uppercase px-3 py-1.5"
              style={{ backgroundColor: `${service.accent}25`, color: service.accent, border: `1px solid ${service.accent}40` }}
              animate={{ opacity: hovered ? 1 : 0.5 }}
            >
              {service.tag}
            </motion.span>
            <span className="text-white/20 text-xs font-mono tracking-widest">{service.num}</span>
          </div>

          {/* Bottom text */}
          <div>
            <motion.h3
              className="text-2xl md:text-3xl font-black tracking-tight text-white leading-tight mb-3"
              animate={{ y: hovered ? -4 : 0 }}
              transition={{ duration: 0.5 }}
            >
              {service.title}
            </motion.h3>
            <motion.p
              className="text-sm text-white/60 leading-relaxed max-w-xs mb-4"
              animate={{ opacity: hovered ? 1 : 0.5, y: hovered ? 0 : 8 }}
              transition={{ duration: 0.5 }}
            >
              {service.desc}
            </motion.p>
            <motion.div
              className="flex flex-wrap gap-2"
              animate={{ opacity: hovered ? 1 : 0, y: hovered ? 0 : 10 }}
              transition={{ duration: 0.45, delay: 0.05 }}
            >
              {service.highlights.map((h: string) => (
                <span key={h} className="text-[10px] font-semibold tracking-[0.15em] uppercase text-white/50 border border-white/10 px-2 py-1">
                  {h}
                </span>
              ))}
            </motion.div>
          </div>
        </div>
      </div>

      {/* Bottom accent bar */}
      <motion.div
        className="h-[3px] w-full"
        style={{ backgroundColor: service.accent }}
        animate={{ scaleX: hovered ? 1 : 0.15, originX: 0 }}
        transition={{ duration: 0.6, ease: [0.85, 0, 0.15, 1] }}
      />
    </motion.div>
  );
}

export default function ServicesSection() {
  return (
    <section id="services" className="relative bg-log-black py-24 md:py-36 overflow-hidden">
      {/* Ambient glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(193,57,43,0.06) 0%, transparent 70%)', filter: 'blur(60px)' }} />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(32,79,144,0.06) 0%, transparent 70%)', filter: 'blur(60px)' }} />

      <div className="max-w-[1440px] mx-auto px-6 md:px-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-14 md:mb-20">
          <div>
            <motion.div
              initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.7 }}
              className="flex items-center gap-4 mb-5"
            >
              <div className="w-10 h-[1px] bg-log-red" />
              <span className="text-[10px] font-semibold tracking-[0.3em] uppercase text-log-pearl/40">What We Do</span>
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.1 }}
              className="text-4xl md:text-5xl lg:text-7xl font-black tracking-tighter text-log-pearl leading-[0.9]"
            >
              Six pillars<br />of <span className="text-log-red">growth.</span>
            </motion.h2>
          </div>
          <motion.p
            initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}
            viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.3 }}
            className="text-sm text-log-pearl/40 max-w-xs mt-6 md:mt-0 leading-relaxed"
          >
            Each service is a precision-engineered pillar designed to support your brand's long-term growth architecture.
          </motion.p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((s, i) => <ServiceCard key={s.title} service={s} index={i} />)}
        </div>
      </div>
    </section>
  );
}