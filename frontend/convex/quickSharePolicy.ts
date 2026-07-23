export const MIB = 1024 * 1024;
export const DAY_MS = 24 * 60 * 60 * 1000;

export const QUICK_SHARE_POLICY = {
  anonymous: {
    maxBytes: 250 * MIB,
    hourlyStarts: 10,
    dailyBytes: 500 * MIB,
    active: 2,
    smallCutoffBytes: 25 * MIB,
    smallLifetimeMs: 7 * DAY_MS,
    largeLifetimeMs: DAY_MS,
  },
  signedIn: {
    maxBytes: 2 * 1024 * MIB,
    hourlyStarts: 60,
    dailyBytes: 5 * 1024 * MIB,
    active: 5,
    smallCutoffBytes: 250 * MIB,
    smallLifetimeMs: 30 * DAY_MS,
    largeLifetimeMs: 7 * DAY_MS,
  },
  retentionMs: 30 * DAY_MS,
  chunkBytes: 16 * MIB,
  publicIdLength: 8,
} as const;

export type QuickShareTier = "anonymous" | "signedIn";

export function policyForTier(tier: QuickShareTier) {
  return QUICK_SHARE_POLICY[tier];
}

export function publicLifetimeMs(tier: QuickShareTier, originalSize: number) {
  const policy = policyForTier(tier);
  return originalSize <= policy.smallCutoffBytes
    ? policy.smallLifetimeMs
    : policy.largeLifetimeMs;
}

export function startOfHour(now: number) {
  return Math.floor(now / (60 * 60 * 1000)) * 60 * 60 * 1000;
}

export function startOfDay(now: number) {
  return Math.floor(now / DAY_MS) * DAY_MS;
}
