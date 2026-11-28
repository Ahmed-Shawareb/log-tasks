"use client";
// Ported from the Base44 site (LOG — Lots Of Growth).
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";

const filmImages = [
  'https://images.unsplash.com/photo-1601412436009-d964bd02edbc?w=800&q=70',
  'https://images.unsplash.com/photo-1515378960530-7c0da6231fb1?w=800&q=70',
  'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&q=70',
  'https://images.unsplash.com/photo-1609921212029-bb5a28e60960?w=800&q=70',
  'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800&q=70',
];

export default function LoadingScreen({ onComplete }: { onComplete: () => void }) {
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) { clearInterval(interval); return 100; }
        return prev + 3;
      });
    }, 40);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (progress >= 100) {
      const t1 = setTimeout(() => setDone(true), 400);
      const t2 = setTimeout(() => onComplete(), 1200);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [progress, onComplete]);

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.8, ease: [0.85, 0, 0.15, 1] }}
          className="fixed inset-0 z-[100] bg-log-black flex flex-col items-center justify-center overflow-hidden"
        >
          {/* Logo top left */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="absolute top-8 left-8 md:top-10 md:left-12 z-10"
          >
            <span className="text-log-pearl text-xl font-black tracking-tighter">LOG</span>
          </motion.div>

          {/* Film Strip */}
          <div className="w-full overflow-hidden">
            <motion.div
              animate={{ x: [0, -1600] }}
              transition={{ duration: 6, ease: 'linear', repeat: Infinity }}
              className="flex gap-4 items-center"
              style={{ width: 'max-content' }}
            >
              {[...filmImages, ...filmImages, ...filmImages].map((img, i) => (
                <div
                  key={i}
                  className="w-[260px] h-[180px] md:w-[380px] md:h-[240px] flex-shrink-0 overflow-hidden"
                >
                  <img
                    src={img}
                    alt=""
                    className="w-full h-full object-cover"
                    style={{ filter: 'grayscale(40%) contrast(1.15) brightness(0.85)' }}
                  />
                </div>
              ))}
            </motion.div>
          </div>

          {/* Overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-r from-log-black via-transparent to-log-black pointer-events-none" />

          {/* Progress & text */}
          <div className="absolute bottom-10 left-0 right-0 flex flex-col items-center gap-4 px-6">
            <div className="w-48 h-[1px] bg-log-grey/30 overflow-hidden">
              <motion.div
                className="h-full bg-log-pearl"
                animate={{ width: `${progress}%` }}
                transition={{ ease: 'easeOut' }}
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-log-pearl/30 text-[10px] font-medium tracking-[0.4em] uppercase">
                {progress < 100 ? 'Loading' : 'Welcome'}
              </span>
              <span className="text-log-pearl/20 text-[10px] font-mono">{progress}%</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}