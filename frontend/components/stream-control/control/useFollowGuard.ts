"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Guard for "follow the session settings" effects: remote values must not be
 * applied while the streamer is actively editing in THIS tab, or an in-flight
 * echo carrying an older snapshot would revert the fresh local change.
 *
 * Call `touch()` whenever a local edit/write happens. In the follow effect,
 * call `deferIfEditing()` first — when it returns a cleanup function, return
 * it instead of applying (the effect re-runs via `retryTick` once the edit
 * window has passed, so the remote value is still picked up afterwards).
 */
export function useFollowGuard(windowMs = 2500) {
  const lastEditRef = useRef(0);
  const [retryTick, setRetryTick] = useState(0);

  const touch = useCallback(() => {
    lastEditRef.current = Date.now();
  }, []);

  const deferIfEditing = useCallback(() => {
    const remaining = lastEditRef.current + windowMs - Date.now();
    if (remaining <= 0) return null;
    const timer = setTimeout(
      () => setRetryTick((tick) => tick + 1),
      remaining + 100,
    );
    return () => clearTimeout(timer);
  }, [windowMs]);

  return { touch, deferIfEditing, retryTick };
}
