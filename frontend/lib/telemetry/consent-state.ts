import { isOverlayRoute } from "./overlay";

let analyticsConsent = false;

export function hasAnalyticsConsent(): boolean {
  return (
    analyticsConsent &&
    (typeof window === "undefined" || !isOverlayRoute(window.location.pathname))
  );
}

export function setAnalyticsConsent(accepted: boolean): void {
  analyticsConsent = accepted;
}
