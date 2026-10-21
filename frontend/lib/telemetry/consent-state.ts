let analyticsConsent = false;

export function hasAnalyticsConsent(): boolean {
  return analyticsConsent;
}

export function setAnalyticsConsent(accepted: boolean): void {
  analyticsConsent = accepted;
}
