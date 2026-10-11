"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Shared motion vocabulary for the show looks. Every board includes
 * LOOK_MOTION_KEYFRAMES once; the hooks drive the few effects CSS cannot
 * (typewriter text, change-triggered replays).
 */
export const LOOK_MOTION_KEYFRAMES = `
@keyframes look-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
@keyframes look-leave { to { opacity: 0; transform: scale(0.85) rotate(4deg); } }
@keyframes look-pop { 0% { opacity: 0; transform: translateY(10px) scale(0.96); } 100% { opacity: 1; transform: none; } }
@keyframes look-wipe { 0% { clip-path: inset(0 100% 0 0); } 100% { clip-path: inset(0 0 0 0); } }
@keyframes look-wipe-up { 0% { clip-path: inset(100% 0 0 0); } 100% { clip-path: inset(0 0 0 0); } }
@keyframes look-stamp { 0% { opacity: 0; transform: scale(1.8) rotate(-12deg); } 60% { opacity: 1; transform: scale(0.94) rotate(-14deg); } 100% { transform: scale(1) rotate(-14deg); } }
@keyframes look-stamp-flat { 0% { opacity: 0; transform: scale(1.7); } 60% { opacity: 1; transform: scale(0.95); } 100% { transform: scale(1); } }
@keyframes look-draw { to { stroke-dashoffset: 0; } }
@keyframes look-flicker { 0%, 100% { opacity: 1; } 20% { opacity: 0.35; } 40% { opacity: 0.9; } 60% { opacity: 0.2; } 80% { opacity: 0.8; } }
@keyframes look-flash { 0% { filter: brightness(1.9) saturate(.4) drop-shadow(0 0 10px rgba(255,255,255,.9)); } 45% { filter: brightness(1.25) saturate(1) drop-shadow(0 0 4px rgba(255,255,255,.4)); } 100% { filter: brightness(1) saturate(1); } }
@keyframes look-shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-4px) rotate(-1deg); } 40% { transform: translateX(4px) rotate(1deg); } 60% { transform: translateX(-3px); } 80% { transform: translateX(3px); } }
@keyframes look-rise { 0% { opacity: 0; transform: translateY(40px); } 100% { opacity: 1; transform: none; } }
@keyframes look-drop { 0% { opacity: 0; transform: translateY(-60px) scale(1.1); } 70% { opacity: 1; transform: translateY(4px) scale(0.98); } 100% { transform: none; } }
@keyframes look-peel { 0% { opacity: 0; transform: rotate(-18deg) scale(0.4) translate(-30%, 40%); } 70% { opacity: 1; transform: rotate(4deg) scale(1.06); } 100% { transform: none; } }
@keyframes look-glint { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
@keyframes look-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@keyframes look-glow { 0%, 100% { filter: drop-shadow(0 0 4px currentColor); } 50% { filter: drop-shadow(0 0 18px currentColor); } }
@keyframes look-develop { 0% { filter: brightness(0) contrast(0.6); } 40% { filter: brightness(0.5) sepia(1) contrast(0.8); } 100% { filter: none; } }
@keyframes look-blink { 50% { opacity: 0; } }
@keyframes look-dust { 0% { opacity: 0.9; transform: translate(0, 0) scale(1); } 100% { opacity: 0; transform: translate(var(--dx, 20px), var(--dy, -30px)) scale(0.3); } }
@keyframes look-ink { 0% { width: 0; } 100% { width: 100%; } }
@keyframes look-shimmer { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }
@media (prefers-reduced-motion: reduce) {
  [data-look], [data-look] * { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; animation-delay: 0ms !important; transition-duration: 0.01ms !important; }
}
`;

/** Types `text` out one character at a time; returns the visible prefix. */
export function useTypewriter(
  text: string,
  speedMs = 34,
  enabled = true,
): string {
  const [length, setLength] = useState(enabled ? 0 : text.length);
  useEffect(() => {
    if (!enabled) {
      setLength(text.length);
      return;
    }
    setLength(0);
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setLength(i);
      if (i >= text.length) window.clearInterval(id);
    }, speedMs);
    return () => window.clearInterval(id);
  }, [text, speedMs, enabled]);
  return text.slice(0, length);
}

/**
 * A counter that increments every time `value` changes (after mount), to
 * key a replayed CSS animation on a sprite swap or a state change.
 */
export function useChangeTick(value: unknown): number {
  const last = useRef(value);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (Object.is(last.current, value)) return;
    last.current = value;
    setTick((t) => t + 1);
  }, [value]);
  return tick;
}

/** Deterministic pseudo-random in [0,1) for scatter effects (no hydration drift). */
export function scatter(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}
