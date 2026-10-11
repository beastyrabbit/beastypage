/**
 * Pure timing for the themed evolution ceremony on the overlay: the whole
 * show is a schedule in elapsed ms (summon → banner → roll × n → reveal …
 * → finale) and every instance evaluates it against the shared ceremony
 * clock, so two overlays agree on the step, the roll phase and even the
 * strobe frame without talking to each other.
 */

import type { EvolutionStreamCommand } from "./streamEvolution";

export const CEREMONY_MS = {
  summon: 3000,
  banner: 2000,
  reveal: 2000,
  revealPerAddition: 180,
  finale: 3500,
  rollMin: 2500,
  rollMax: 8000,
  /** Fixed wrong candidate, held still. */
  nearmiss: 500,
  /** The landed frame shown INSIDE the roll step, before the reveal step. */
  land: 700,
  spinupFrac: 0.15,
  cruiseFrac: 0.45,
  slowdownFrac: 0.3,
  /** Frame delays (ms): spin-up eases 240→90, cruise 90, slowdown eases 90→420. */
  frameFast: 90,
  frameSlowStart: 240,
  frameSlowEnd: 420,
  candidateCount: 12,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Budget of one roll: the charge split over the additions, clamped. */
export function rollBudgetMs(chargeMs: number, additionCount: number): number {
  return clamp(
    chargeMs / Math.max(1, additionCount),
    CEREMONY_MS.rollMin,
    CEREMONY_MS.rollMax,
  );
}

/** Total charge the chamber and the themed engine both use: max(1, n) × rollBudgetMs. */
export function chargeTotalMs(chargeMs: number, additionCount: number): number {
  return Math.max(1, additionCount) * rollBudgetMs(chargeMs, additionCount);
}

export interface ScheduleCat {
  key: string;
  branchLabel: string | null;
  additionCount: number;
}

export function scheduleCatsFromCommand(
  command: Pick<EvolutionStreamCommand, "cats">,
): ScheduleCat[] {
  return command.cats.map((cat) => ({
    key: cat.key,
    branchLabel: cat.branchLabel,
    additionCount: cat.additions?.length ?? 0,
  }));
}

export type CeremonyStep =
  | { kind: "summon" }
  | { kind: "banner"; index: number }
  | { kind: "roll"; index: number; addition: number; count: number }
  | { kind: "reveal"; index: number }
  | { kind: "finale" }
  | { kind: "done" };

export interface ScheduledStep {
  step: CeremonyStep;
  startMs: number;
  endMs: number;
}

export interface CeremonySchedule {
  /** summon, then per cat 1..: [banner when the branch changes] roll×n reveal, then finale. */
  steps: ScheduledStep[];
  /** = finale.endMs; "done" is implicit from here. */
  totalMs: number;
  chargeMs: number;
}

/**
 * Cats are in command order (starter first); totalCount bounds the walk.
 * A cat with additionCount === 0 gets no roll steps — only its reveal.
 */
export function buildCeremonySchedule(
  cats: readonly ScheduleCat[],
  totalCount: number,
  chargeMs: number,
): CeremonySchedule {
  const steps: ScheduledStep[] = [];
  let t = 0;
  const push = (step: CeremonyStep, duration: number) => {
    steps.push({ step, startMs: t, endMs: t + duration });
    t += duration;
  };
  push({ kind: "summon" }, CEREMONY_MS.summon);
  const last = Math.min(totalCount, cats.length);
  for (let i = 1; i < last; i += 1) {
    const cat = cats[i];
    const previous = cats[i - 1];
    if (cat.branchLabel !== previous?.branchLabel) {
      push({ kind: "banner", index: i }, CEREMONY_MS.banner);
    }
    const count = Math.max(0, cat.additionCount);
    const budget = rollBudgetMs(chargeMs, count);
    for (let j = 0; j < count; j += 1) {
      push({ kind: "roll", index: i, addition: j, count }, budget);
    }
    push(
      { kind: "reveal", index: i },
      CEREMONY_MS.reveal + CEREMONY_MS.revealPerAddition * count,
    );
  }
  push({ kind: "finale" }, CEREMONY_MS.finale);
  return { steps, totalMs: t, chargeMs };
}

/** The scheduled step at `elapsedMs` (start inclusive, end exclusive); "done" past the end. */
export function stepAt(
  schedule: CeremonySchedule,
  elapsedMs: number,
): ScheduledStep {
  if (elapsedMs >= schedule.totalMs) return doneStep(schedule);
  for (const scheduled of schedule.steps) {
    if (elapsedMs < scheduled.endMs) return scheduled;
  }
  // Unreachable for a well-formed schedule; keep the type honest.
  return schedule.steps.at(-1) ?? doneStep(schedule);
}

/** The implicit "done" step from the end of the schedule on. */
function doneStep(schedule: CeremonySchedule): ScheduledStep {
  return {
    step: { kind: "done" },
    startMs: schedule.totalMs,
    endMs: Number.POSITIVE_INFINITY,
  };
}

function findRoll(
  schedule: CeremonySchedule,
  catIndex: number,
  addition: number,
): ScheduledStep | null {
  for (const scheduled of schedule.steps) {
    const { step } = scheduled;
    if (
      step.kind === "roll" &&
      step.index === catIndex &&
      step.addition === addition
    ) {
      return scheduled;
    }
  }
  return null;
}

/** Strobe span of a roll: everything before the near miss and the land. */
function strobeSpanMs(budgetMs: number): number {
  return budgetMs - CEREMONY_MS.nearmiss - CEREMONY_MS.land;
}

/** Elapsed ms at which roll (catIndex, addition) enters its near-miss phase (= hold park point). */
export function rollNearMissMs(
  schedule: CeremonySchedule,
  catIndex: number,
  addition: number,
): number | null {
  const roll = findRoll(schedule, catIndex, addition);
  if (!roll) return null;
  return roll.startMs + strobeSpanMs(roll.endMs - roll.startMs);
}

/** Elapsed ms at which roll (catIndex, addition) enters its land phase (= "Reveal now" target). */
export function rollLandMs(
  schedule: CeremonySchedule,
  catIndex: number,
  addition: number,
): number | null {
  const nearMiss = rollNearMissMs(schedule, catIndex, addition);
  return nearMiss === null ? null : nearMiss + CEREMONY_MS.nearmiss;
}

export type RollPhase = "spinup" | "cruise" | "slowdown" | "nearmiss" | "land";

export interface RollPhaseState {
  phase: RollPhase;
  /** 0..1 within the whole roll (elapsedInRoll / budgetMs). */
  progress: number;
  /** Strobe frame index: 0.. during spinup/cruise/slowdown, frameCount − 1 during nearmiss, −1 during land. */
  frameIndex: number;
  /** rollFrameTimes(A).length + 1 (the extra one is the near-miss frame). */
  frameCount: number;
}

/**
 * Cumulative start times (ms) of the strobe frames over the strobe span A
 * (not the budget): spin-up delays ease 240→90 over the first 15 %, cruise
 * holds 90 until 60 %, the slowdown eases 90→420 (t²) over the last 40 %.
 * Monotone; the last start is < A.
 */
export function rollFrameTimes(strobeMs: number): number[] {
  const starts: number[] = [];
  if (strobeMs <= 0) return starts;
  const { spinupFrac, cruiseFrac, frameFast, frameSlowStart, frameSlowEnd } =
    CEREMONY_MS;
  const slowdownStart = spinupFrac + cruiseFrac;
  let t = 0;
  while (t < strobeMs) {
    starts.push(t);
    const frac = t / strobeMs;
    let delay: number;
    if (frac < spinupFrac) {
      const u = frac / spinupFrac;
      delay = frameSlowStart + (frameFast - frameSlowStart) * u;
    } else if (frac < slowdownStart) {
      delay = frameFast;
    } else {
      const u = (frac - slowdownStart) / (1 - slowdownStart);
      delay = frameFast + (frameSlowEnd - frameFast) * u * u;
    }
    t += delay;
  }
  return starts;
}

/**
 * Phase + strobe frame for `elapsedInRoll` of a roll of `budgetMs`:
 *   A = budgetMs − nearmiss − land
 *   spinup [0, .15A) · cruise [.15A, .60A) · slowdown [.60A, A) · nearmiss [A, A+500) · land [A+500, budgetMs)
 * reducedMotion: "cruise" with frameIndex −1 for [0, A+500) (no strobe, no near miss), then land.
 */
export function rollPhaseAt(
  elapsedInRoll: number,
  budgetMs: number,
  reducedMotion = false,
): RollPhaseState {
  const strobeMs = strobeSpanMs(budgetMs);
  const frameTimes = rollFrameTimes(strobeMs);
  const frameCount = frameTimes.length + 1;
  const elapsed = Math.max(0, elapsedInRoll);
  const progress = budgetMs > 0 ? clamp(elapsed / budgetMs, 0, 1) : 1;
  const landAt = strobeMs + CEREMONY_MS.nearmiss;
  if (elapsed >= landAt) {
    return { phase: "land", progress, frameIndex: -1, frameCount };
  }
  if (reducedMotion) {
    return { phase: "cruise", progress, frameIndex: -1, frameCount };
  }
  if (elapsed >= strobeMs) {
    return {
      phase: "nearmiss",
      progress,
      frameIndex: frameCount - 1,
      frameCount,
    };
  }
  const phase = strobePhaseAt(elapsed / strobeMs);
  let frameIndex = 0;
  for (let i = 0; i < frameTimes.length; i += 1) {
    if (frameTimes[i] <= elapsed) frameIndex = i;
    else break;
  }
  return { phase, progress, frameIndex, frameCount };
}

/** Strobe phase at `frac` of the strobe span: spinup < 15 %, cruise < 60 %, slowdown after. */
function strobePhaseAt(frac: number): RollPhase {
  if (frac < CEREMONY_MS.spinupFrac) return "spinup";
  if (frac < CEREMONY_MS.spinupFrac + CEREMONY_MS.cruiseFrac) return "cruise";
  return "slowdown";
}

/** mulberry32. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over `${seq}:${catKey}:${addition}` — the same roll seeds the same on every instance. */
export function rollSeed(
  seq: number,
  catKey: string,
  addition: number,
): number {
  const text = `${seq.toString()}:${catKey}:${addition.toString()}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.codePointAt(i) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * The whole strobe order of a roll, computed once per roll: `frameCount`
 * candidate indices — two full in-order cycles 0..C−1 first (truncated when
 * frameCount < 2C), then seeded picks with no two equal neighbours. The last
 * entry is the near-miss index. Pure in (seed, frameCount, C).
 */
export function buildCandidateOrder(
  seed: number,
  frameCount: number,
  candidateCount: number,
): number[] {
  const count = Math.max(0, Math.floor(frameCount));
  if (candidateCount <= 0 || count === 0) return [];
  if (candidateCount === 1) return new Array<number>(count).fill(0);
  const random = seededRandom(seed);
  const order: number[] = [];
  for (let k = 0; k < count; k += 1) {
    if (k < 2 * candidateCount) {
      order.push(k % candidateCount);
      continue;
    }
    const previous = order[k - 1];
    // Pick among the C − 1 candidates that are not the previous one.
    let pick = Math.min(
      Math.floor(random() * (candidateCount - 1)),
      candidateCount - 2,
    );
    if (pick >= previous) pick += 1;
    order.push(pick);
  }
  return order;
}
