"use client";
import { KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";

/**
 * Mouse: drag after moving a few pixels. Touch: press and hold briefly, so a normal swipe still scrolls the page
 * (draggable items use touch-action: manipulation, not none).
 */
export function useDragSensors({ keyboard = false } = {}) {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    ...(keyboard ? [useSensor(KeyboardSensor)] : []),
  );
}
