import { isOverlayRoute } from "./overlay";

let analyticsConsent = false;
const listeners = new Set<() => void>();

export function hasAnalyticsConsent(): boolean {
  return (
    analyticsConsent &&
    (typeof window === "undefined" || !isOverlayRoute(window.location.pathname))
  );
}

export function setAnalyticsConsent(accepted: boolean): void {
  if (analyticsConsent === accepted) return;
  analyticsConsent = accepted;
  for (const listener of listeners) listener();
}

/** Runs the listener after each consent change. Returns the unsubscribe function. */
export function onAnalyticsConsentChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
