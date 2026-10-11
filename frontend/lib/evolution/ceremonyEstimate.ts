/**
 * Duration estimate for the evolution ceremony animation, shared by the
 * evolution generator page and the stream control panel.
 *
 * "page" pacing is the generator page's chamber (keep in sync with
 * PACING.page in components/evolution/EvolutionCeremony.tsx); "overlay" is
 * the themed stream ceremony (CEREMONY_MS in lib/evolution/rollSchedule.ts).
 */

import { CEREMONY_MS, rollBudgetMs } from "./rollSchedule";

export type CeremonyPacing = "page" | "overlay";

// Page: rough per-step costs in seconds at 1x speed.
const PAGE_SUMMON = 5;
const PAGE_BANNER = 3.5;
const PAGE_REVEAL = 6.7;

/** Overlay: two additions assumed per evolution; reveal = 2.0 + 0.18 · 2. */
const OVERLAY_ADDITIONS = 2;

export function estimateCeremonySecondsFromCounts(
  branchCount: number,
  evolutionCount: number,
  spinSeconds: number,
  pacing: CeremonyPacing = "page",
) {
  if (pacing === "overlay") {
    const rollSeconds =
      rollBudgetMs(spinSeconds * 1000, OVERLAY_ADDITIONS) / 1000;
    const revealSeconds =
      (CEREMONY_MS.reveal + CEREMONY_MS.revealPerAddition * OVERLAY_ADDITIONS) /
      1000;
    return (
      CEREMONY_MS.summon / 1000 +
      branchCount * (CEREMONY_MS.banner / 1000) +
      evolutionCount * (OVERLAY_ADDITIONS * rollSeconds + revealSeconds) +
      CEREMONY_MS.finale / 1000
    );
  }
  return (
    PAGE_SUMMON +
    branchCount * PAGE_BANNER +
    evolutionCount * (spinSeconds + PAGE_REVEAL)
  );
}

export function estimateCeremonySeconds(
  clanCount: number,
  targetLevel: number,
  spinSeconds: number,
  pacing: CeremonyPacing = "page",
) {
  return estimateCeremonySecondsFromCounts(
    clanCount,
    clanCount * targetLevel,
    spinSeconds,
    pacing,
  );
}

export function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}
