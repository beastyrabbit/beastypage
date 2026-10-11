"use client";

import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { Rect } from "./plaqueModel";

/** The overlay canvas every show wrapper draws on; the harness scales it. */
export const OBS_CANVAS_WIDTH = 1280;

const EMPTY_RECTS: ReadonlyMap<string, Rect> = new Map();

/**
 * `el`'s rect in `container`'s own CSS-pixel space. The harness scales the
 * 1280×1080 canvas with a transform, so client rects are divided by
 * container.getBoundingClientRect().width / 1280.
 */
export function measureRectIn(container: HTMLElement, el: Element): Rect {
  const c = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const scale = c.width > 0 ? c.width / OBS_CANVAS_WIDTH : 1;
  return {
    x: (r.left - c.left) / scale,
    y: (r.top - c.top) / scale,
    width: r.width / scale,
    height: r.height / scale,
  };
}

function sameRect(a: Rect, b: Rect): boolean {
  return (
    Math.abs(a.x - b.x) < 0.5 &&
    Math.abs(a.y - b.y) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

function sameRects(
  a: ReadonlyMap<string, Rect>,
  b: ReadonlyMap<string, Rect>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [key, rect] of a) {
    const other = b.get(key);
    if (!other || !sameRect(rect, other)) return false;
  }
  return true;
}

function measureAll(
  container: HTMLElement | null,
  selectorAttr: string,
): Map<string, Rect> {
  const rects = new Map<string, Rect>();
  if (!container) return rects;
  const nodes = container.querySelectorAll<HTMLElement>(`[${selectorAttr}]`);
  for (const el of nodes) {
    const key = el.getAttribute(selectorAttr);
    // First match wins, like the ceremony's confetti origin lookup.
    if (key === null || rects.has(key)) continue;
    rects.set(key, measureRectIn(container, el));
  }
  return rects;
}

/**
 * Measures every `[selectorAttr]` element inside `containerRef` and returns rects in the
 * container's own CSS-pixel space (the harness scales the 1280×1080 canvas; divide by
 * container.getBoundingClientRect().width / 1280). Keyed by the attribute's value.
 * Re-measures on ResizeObserver (container), on `deps` change, and once per animation frame
 * while `live` is true (deal / depart / repack beats; roll steps), otherwise only on deps.
 */
export function useElementRects(
  containerRef: RefObject<HTMLElement | null>,
  selectorAttr: "data-batch-cat" | "data-lineage-key",
  deps: readonly unknown[],
  live = false,
): ReadonlyMap<string, Rect> {
  const [rects, setRects] = useState<ReadonlyMap<string, Rect>>(EMPTY_RECTS);
  const lastRef = useRef<ReadonlyMap<string, Rect>>(EMPTY_RECTS);

  const measure = useCallback(() => {
    const next = measureAll(containerRef.current, selectorAttr);
    if (sameRects(lastRef.current, next)) return;
    lastRef.current = next;
    setRects(next);
  }, [containerRef, selectorAttr]);

  // `deps` are the caller's re-measure triggers (beat kind, stage id, step).
  useLayoutEffect(measure, [measure, ...deps]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, measure]);

  useEffect(() => {
    if (!live) return;
    let frame = 0;
    const loop = () => {
      measure();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [live, measure]);

  return rects;
}

const FLIP_ATTR = "data-batch-cat";

/**
 * FLIP for the five repacking batch looks. The departed cat leaves `survivors` in the SAME render
 * that sets beat.kind = "repack" (fadingId is cleared there), so a snapshot taken on the rising
 * edge of "repack" would already see the repacked layout (First == Last, no motion). Therefore:
 *  - while `beatKind === "depart"` the hook measures `[data-batch-cat]` rects on every animation
 *    frame into a ref (the last one is First);
 *  - on the first useLayoutEffect with `beatKind === "repack"` it measures Last, and for every id
 *    present in both sets applies `transform: translate(dx,dy)` with `transition: none`, forces a
 *    reflow, then `transition: transform ${durationMs}ms cubic-bezier(.2,1,.4,1)` + `transform: ""`;
 *    inline styles cleared on transitionend.
 * No-op when `enabled` is false (reduced motion). Harness acceptance asserts non-zero transforms.
 */
export function useFlipRepack(
  containerRef: RefObject<HTMLElement | null>,
  beatKind: string,
  enabled: boolean,
  durationMs = 400,
): void {
  const firstRef = useRef<Map<string, Rect> | null>(null);

  // First: keep measuring through the depart beat; the last frame wins.
  useEffect(() => {
    if (!enabled || beatKind !== "depart") return;
    let frame = 0;
    const loop = () => {
      firstRef.current = measureAll(containerRef.current, FLIP_ATTR);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [beatKind, enabled, containerRef]);

  // Last + invert + play on the first repack layout.
  useLayoutEffect(() => {
    if (beatKind !== "repack") return;
    const first = firstRef.current;
    firstRef.current = null;
    const container = containerRef.current;
    if (!enabled || !first || !container) return;

    const cleanups: Array<() => void> = [];
    const nodes = container.querySelectorAll<HTMLElement>(`[${FLIP_ATTR}]`);
    for (const el of nodes) {
      const id = el.getAttribute(FLIP_ATTR);
      if (id === null) continue;
      const before = first.get(id);
      if (!before) continue;
      const after = measureRectIn(container, el);
      const dx = before.x - after.x;
      const dy = before.y - after.y;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;

      // Compose with any inline transform the look set (e.g. a flipped sprite).
      const priorTransform = el.style.transform;
      const priorTransition = el.style.transition;
      const shift = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)`;
      el.style.transition = "none";
      el.style.transform = priorTransform
        ? `${shift} ${priorTransform}`
        : shift;
      void el.getBoundingClientRect();
      el.style.transition = `transform ${durationMs.toString()}ms cubic-bezier(.2,1,.4,1)`;
      el.style.transform = priorTransform;

      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        el.removeEventListener("transitionend", onEnd);
        window.clearTimeout(timer);
        el.style.transition = priorTransition;
      };
      const onEnd = (event: TransitionEvent) => {
        if (event.target === el && event.propertyName === "transform") finish();
      };
      el.addEventListener("transitionend", onEnd);
      const timer = window.setTimeout(finish, durationMs + 120);
      cleanups.push(finish);
    }
    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, [beatKind, enabled, durationMs, containerRef]);
}
