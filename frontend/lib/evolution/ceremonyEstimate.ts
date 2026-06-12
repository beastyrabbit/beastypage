/**
 * Duration estimate for the evolution ceremony animation, shared by the
 * evolution generator page and the stream control panel.
 *
 * Rough per-step costs in seconds at 1x speed — keep in sync with
 * STEP_DURATIONS in components/evolution/EvolutionCeremony.tsx.
 */
const ESTIMATE_SUMMON = 5;
const ESTIMATE_BANNER = 3.5;
const ESTIMATE_REVEAL = 6.7;

export function estimateCeremonySecondsFromCounts(
  branchCount: number,
  evolutionCount: number,
  spinSeconds: number,
) {
  return (
    ESTIMATE_SUMMON +
    branchCount * ESTIMATE_BANNER +
    evolutionCount * (spinSeconds + ESTIMATE_REVEAL)
  );
}

export function estimateCeremonySeconds(
  clanCount: number,
  targetLevel: number,
  spinSeconds: number,
) {
  return estimateCeremonySecondsFromCounts(
    clanCount,
    clanCount * targetLevel,
    spinSeconds,
  );
}

export function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}
