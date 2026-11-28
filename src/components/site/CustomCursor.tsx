"use client";
// Ported from the Base44 site (LOG — Lots Of Growth).
import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";

export default function CustomCursor() {
  const [hovered, setHovered] = useState(false);
  const [hidden, setHidden] = useState(true);
  const cursorX = useMotionValue(-100);
  const cursorY = useMotionValue(-100);
  const springX = useSpring(cursorX, { stiffness: 400, damping: 35 });
  const springY = useSpring(cursorY, { stiffness: 400, damping: 35 });
  const dotX = useSpring(cursorX, { stiffness: 800, damping: 50 });
  const dotY = useSpring(cursorY, { stiffness: 800, damping: 50 });

  useEffect(() => {
    // Only show on non-touch devices
    if ('ontouchstart' in window) return;

    const move = (e: MouseEvent) => {
      setHidden(false);
      cursorX.set(e.clientX);
      cursorY.set(e.clientY);
    };

    const addHover = () => setHovered(true);
    const removeHover = () => setHovered(false);

    window.addEventListener('mousemove', move);

    const addListeners = () => {
      document.querySelectorAll('a, button, [role="button"]').forEach(el => {
        el.addEventListener('mouseenter', addHover);
        el.addEventListener('mouseleave', removeHover);
      });
    };

    addListeners();
    const interval = setInterval(addListeners, 1000);

    return () => {
      window.removeEventListener('mousemove', move);
      clearInterval(interval);
    };
  }, []);

  if (hidden) return null;

  return (
    <>
      {/* Ring */}
      <motion.div
        className="fixed top-0 left-0 pointer-events-none z-[9999] mix-blend-difference"
        style={{
          x: springX,
          y: springY,
          translateX: '-50%',
          translateY: '-50%',
        }}
        animate={{ scale: hovered ? 1.8 : 1, opacity: hovered ? 0.6 : 0.4 }}
        transition={{ duration: 0.3 }}
      >
        <div
          className="border border-white rounded-full"
          style={{ width: 36, height: 36 }}
        />
      </motion.div>

      {/* Dot */}
      <motion.div
        className="fixed top-0 left-0 pointer-events-none z-[9999] bg-white rounded-full mix-blend-difference"
        style={{
          x: dotX,
          y: dotY,
          translateX: '-50%',
          translateY: '-50%',
          width: 6,
          height: 6,
        }}
        animate={{ scale: hovered ? 0 : 1 }}
        transition={{ duration: 0.2 }}
      />
    </>
  );
}