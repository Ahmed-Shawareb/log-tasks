"use client";
// Ported from the Base44 site (LOG — Lots Of Growth).
import { useRef, useState } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";

const projects = [
  { title: 'Brand Campaign', category: 'Media Production', image: 'https://images.unsplash.com/photo-1601412436009-d964bd02edbc?w=900&q=80', year: '2024' },
  { title: 'Studio Session', category: 'Content Creation', image: 'https://images.unsplash.com/photo-1515378960530-7c0da6231fb1?w=900&q=80', year: '2024' },
  { title: 'Digital Velocity', category: 'Performance Marketing', image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=900&q=80', year: '2024' },
  { title: 'Identity System', category: 'Branding & Strategy', image: 'https://images.unsplash.com/photo-1609921212029-bb5a28e60960?w=900&q=80', year: '2023' },
  { title: 'Visual Stories', category: 'UGC Content', image: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=900&q=80', year: '2023' },
];

function ProjectCard({ project, index }: { project: (typeof projects)[number]; index: number }) {
  const [hovered, setHovered] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);
  const springX = useSpring(mouseX, { stiffness: 200, damping: 25 });
  const springY = useSpring(mouseY, { stiffness: 200, damping: 25 });

  const handleMouse = (e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    mouseX.set((e.clientX - rect.left) / rect.width);
    mouseY.set((e.clientY - rect.top) / rect.height);
  };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.8, delay: index * 0.08 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseMove={handleMouse}
      className="flex-shrink-0 w-[82vw] md:w-[50vw] lg:w-[36vw] snap-center cursor-pointer group"
    >
      <div className="relative overflow-hidden" style={{ aspectRatio: '4/5' }}>
        <motion.img
          src={project.image}
          alt={project.title}
          className="w-full h-full object-cover"
          animate={{ scale: hovered ? 1.06 : 1 }}
          transition={{ duration: 0.9, ease: [0.85, 0, 0.15, 1] }}
          style={{
            filter: hovered ? 'brightness(0.4) saturate(0.5)' : 'brightness(0.6) saturate(0.7)',
          }}
        />

        {/* Moving highlight on hover */}
        {hovered && (
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(circle at ${springX.get() * 100}% ${springY.get() * 100}%, rgba(193,57,43,0.3) 0%, transparent 60%)`,
            }}
          />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-log-black/90 via-log-black/10 to-transparent" />

        {/* Top label */}
        <div className="absolute top-5 left-5 right-5 flex items-center justify-between">
          <motion.span
            className="text-[9px] font-bold tracking-[0.35em] uppercase px-2 py-1 border"
            animate={{ opacity: hovered ? 1 : 0.5 }}
            style={{ color: '#C1392B', borderColor: 'rgba(193,57,43,0.3)', backgroundColor: 'rgba(193,57,43,0.05)' }}
          >
            {project.category}
          </motion.span>
          <span className="text-log-pearl/20 text-[10px] font-mono">{project.year}</span>
        </div>

        {/* Bottom content */}
        <div className="absolute bottom-0 left-0 right-0 p-7">
          <motion.h3
            className="text-2xl md:text-3xl font-black tracking-tight text-log-pearl mb-3"
            animate={{ y: hovered ? -4 : 0 }}
            transition={{ duration: 0.4 }}
          >
            {project.title}
          </motion.h3>
          <motion.div
            className="flex items-center gap-2 text-log-pearl/50 text-xs font-medium tracking-[0.15em] uppercase"
            animate={{ opacity: hovered ? 1 : 0, x: hovered ? 0 : -10 }}
            transition={{ duration: 0.4 }}
          >
            <div className="w-6 h-[1px] bg-log-red" />
            View Project
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

export default function ShowreelSection() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scroll = (dir: 'left' | 'right') => scrollRef.current?.scrollBy({ left: dir === 'left' ? -450 : 450, behavior: 'smooth' });

  return (
    <section id="showreel" className="relative bg-log-black py-24 md:py-36 overflow-hidden">
      {/* Ambient */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(193,57,43,0.05) 0%, transparent 70%)', filter: 'blur(80px)' }} />

      {/* Header */}
      <div className="max-w-[1440px] mx-auto px-6 md:px-12 mb-12">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between">
          <div>
            <motion.div
              initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.7 }}
              className="flex items-center gap-4 mb-5"
            >
              <div className="w-10 h-[1px] bg-log-red" />
              <span className="text-[10px] font-semibold tracking-[0.3em] uppercase text-log-pearl/40">Selected Work</span>
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.1 }}
              className="text-4xl md:text-5xl lg:text-7xl font-black tracking-tighter text-log-pearl leading-[0.9]"
            >
              Our <span className="text-log-red">work</span><br />speaks.
            </motion.h2>
          </div>
          <motion.div
            initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}
            viewport={{ once: true }} transition={{ delay: 0.4 }}
            className="flex gap-3 mt-8 md:mt-0"
          >
            {['←', '→'].map((arrow, i) => (
              <motion.button
                key={arrow}
                onClick={() => scroll(i === 0 ? 'left' : 'right')}
                whileHover={{ scale: 1.05, backgroundColor: 'rgba(193,57,43,0.15)' }}
                whileTap={{ scale: 0.95 }}
                className="w-12 h-12 flex items-center justify-center text-log-pearl/50 hover:text-log-pearl transition-colors duration-300 text-base"
                style={{ border: '1px solid rgba(253,253,246,0.1)' }}
              >
                {arrow}
              </motion.button>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Scroll Strip */}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto showreel-scroll px-6 md:px-12 snap-x snap-mandatory pb-2"
      >
        {projects.map((p, i) => <ProjectCard key={p.title} project={p} index={i} />)}
        <div className="flex-shrink-0 w-6 md:w-12" />
      </div>
    </section>
  );
}