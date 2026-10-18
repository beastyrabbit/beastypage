/**
 * Pure timing model of one batch stage: who changes, in which order the
 * new frames land, and how long the windup / deal / hold beats run. The
 * engine (`useBatchShow`), the dev harness and the control board all read
 * the same functions, so every instance agrees on the deal.
 */

import {
  type BatchStage,
  type BatchStreamCat,
  type BatchTortiePlaceholders,
  stageChanged,
  stageValueFor,
} from "@/lib/adoption/streamBatch";

export type BatchBeatKind =
  | "loading"
  | "windup"
  | "deal"
  | "hold"
  | "awaiting"
  | "verdict"
  | "depart"
  | "repack"
  | "done";

export interface BatchBeatGroup {
  /** Raw value shared by the group; null = unchanged. */
  value: string | null;
  label: string;
  catIds: string[];
}

export interface BatchBeat {
  kind: BatchBeatKind;
  stageId: string;
  /**
   * SERVER ms anchor of this beat: windup/deal/hold → stageStartedAt;
   * awaiting/done → stageStartedAt + totalMs; verdict → verdictAt − 3000;
   * depart → lastCullAt; repack → lastCullAt + 1600. 0 while the anchor is
   * not yet known (loading, unstamped windup).
   */
  startedAt: number;
  /** 0 = unbounded (awaiting; windup while frames are still staging or the stage is unstamped). */
  durationMs: number;
  /**
   * "server" when `startedAt` is the session's stamp; "local" when this
   * instance anchored the stage on its own clock because the stamp never
   * echoed (degraded PostgreSQL connection).
   */
  anchor: "server" | "local";
  /** Deal order: unchanged cats first (they all land at t=windup), then groups largest first. */
  order: string[];
  landedIds: string[];
  changedIds: string[];
  unchangedIds: string[];
  rareIds: string[];
  /** Changed groups only, largest first (ties: label asc). */
  groups: BatchBeatGroup[];
  /** Cat under verdict, or the one departing. */
  pendingCullId?: string;
  /** Server ms when the verdict lands (liveState.verdictAt). */
  verdictEndsAt?: number;
}

export interface StageCatInput {
  id: string;
  value: { value: string; label: string } | null;
  changed: boolean;
}

export interface StageTimeline {
  windupMs: number;
  /** Absolute ms from timeline start at which each survivor lands (unchanged = windupMs). */
  landAt: ReadonlyMap<string, number>;
  order: string[];
  groups: BatchBeatGroup[];
  changedIds: string[];
  unchangedIds: string[];
  rareIds: string[];
  /** Last landing + the trailing hold; the hold beat ends here. */
  totalMs: number;
  /** When the trailing hold starts (= last landing). */
  holdFromMs: number;
  quick: boolean;
}

export const BATCH_BEAT_MS = {
  windup: 700,
  windupQuick: 400,
  windupZero: 300,
  stepMin: 60,
  stepMax: 140,
  stepBudget: 6000,
  stepQuick: 250,
  groupGap: 350,
  preLastHold: 600,
  preLastMax: 3,
  holdAfter: 1200,
  holdQuick: 900,
  holdZero: 800,
  holdReduced: 500,
  quickMax: 3,
  rareMinChanged: 4,
  depart: 1600,
  repack: 400,
  departReduced: 200,
  repackReduced: 0,
} as const;

function compareLabel(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

interface StageSplit {
  changedIds: string[];
  unchangedIds: string[];
  groups: BatchBeatGroup[];
  rareIds: string[];
}

/** Changed cats grouped by value (largest first, label asc), unchanged apart; rare = singles once ≥ 4 changed. */
function splitStage(survivors: readonly StageCatInput[]): StageSplit {
  const changedIds: string[] = [];
  const unchangedIds: string[] = [];
  const byValue = new Map<string, BatchBeatGroup>();
  for (const cat of survivors) {
    if (cat.value === null || !cat.changed) {
      unchangedIds.push(cat.id);
      continue;
    }
    changedIds.push(cat.id);
    const group = byValue.get(cat.value.value);
    if (group) group.catIds.push(cat.id);
    else {
      byValue.set(cat.value.value, {
        value: cat.value.value,
        label: cat.value.label,
        catIds: [cat.id],
      });
    }
  }
  const groups = [...byValue.values()].sort(
    (a, b) =>
      b.catIds.length - a.catIds.length || compareLabel(a.label, b.label),
  );
  const rareIds =
    changedIds.length >= BATCH_BEAT_MS.rareMinChanged
      ? groups.filter((g) => g.catIds.length === 1).map((g) => g.catIds[0])
      : [];
  return { changedIds, unchangedIds, groups, rareIds };
}

/** How the deal paces a stage: nothing changed, a quick roll (≤ 3 changed) or the full deal. */
type StagePace = "zero" | "quick" | "full";

function stagePace(changedCount: number): StagePace {
  if (changedCount === 0) return "zero";
  if (changedCount <= BATCH_BEAT_MS.quickMax) return "quick";
  return "full";
}

const WINDUP_MS: Record<StagePace, number> = {
  zero: BATCH_BEAT_MS.windupZero,
  quick: BATCH_BEAT_MS.windupQuick,
  full: BATCH_BEAT_MS.windup,
};

const HOLD_MS: Record<StagePace, number> = {
  zero: BATCH_BEAT_MS.holdZero,
  quick: BATCH_BEAT_MS.holdQuick,
  full: BATCH_BEAT_MS.holdAfter,
};

/** Landing step inside a group: fixed for a quick roll, else the budget split over the changed cats. */
function stepMs(changedCount: number, quick: boolean): number {
  if (quick) return BATCH_BEAT_MS.stepQuick;
  return Math.min(
    BATCH_BEAT_MS.stepMax,
    Math.max(
      BATCH_BEAT_MS.stepMin,
      Math.round(BATCH_BEAT_MS.stepBudget / Math.max(1, changedCount)),
    ),
  );
}

/** Extra beat before the last of ≥ 2 groups when it is small; a quick roll skips it. */
function preLastHoldMs(
  groups: readonly BatchBeatGroup[],
  index: number,
  quick: boolean,
): number {
  const isLast = index === groups.length - 1;
  if (quick || !isLast || groups.length < 2) return 0;
  return groups[index].catIds.length <= BATCH_BEAT_MS.preLastMax
    ? BATCH_BEAT_MS.preLastHold
    : 0;
}

interface DealPace {
  windupMs: number;
  step: number;
  gap: number;
  quick: boolean;
  reduced: boolean;
}

/** When every survivor lands: unchanged cats at the windup, then the groups in order. */
function scheduleLandings(
  unchangedIds: readonly string[],
  groups: readonly BatchBeatGroup[],
  pace: DealPace,
): { landAt: Map<string, number>; order: string[]; lastLanding: number } {
  const { windupMs, step, gap, quick, reduced } = pace;
  const landAt = new Map<string, number>();
  const order: string[] = [];
  for (const id of unchangedIds) {
    landAt.set(id, windupMs);
    order.push(id);
  }
  let lastLanding = windupMs;
  groups.forEach((group, index) => {
    // The gap is measured from the previous group's last landing and is
    // never shorter than a step, so a quick roll (gap 0) stays sequential.
    const start =
      index === 0
        ? windupMs
        : lastLanding +
          Math.max(gap, step) +
          preLastHoldMs(groups, index, quick);
    group.catIds.forEach((id, j) => {
      const at = reduced ? 0 : start + j * step;
      landAt.set(id, at);
      order.push(id);
      lastLanding = at;
    });
  });
  return { landAt, order, lastLanding };
}

export function buildStageBeats(
  survivors: readonly StageCatInput[],
  _stage: BatchStage,
  options?: { reducedMotion?: boolean },
): StageTimeline {
  const { changedIds, unchangedIds, groups, rareIds } = splitStage(survivors);
  const reduced = Boolean(options?.reducedMotion);
  const changedCount = changedIds.length;
  const pace = stagePace(changedCount);
  const quick = pace === "quick";

  const windupMs = reduced ? 0 : WINDUP_MS[pace];
  const holdMs = reduced ? BATCH_BEAT_MS.holdReduced : HOLD_MS[pace];
  const step = stepMs(changedCount, quick);
  const gap = quick ? 0 : BATCH_BEAT_MS.groupGap;

  const { landAt, order, lastLanding } = scheduleLandings(
    unchangedIds,
    groups,
    { windupMs, step, gap, quick, reduced },
  );
  const holdFromMs = reduced ? 0 : lastLanding;
  return {
    windupMs,
    landAt,
    order,
    groups,
    changedIds,
    unchangedIds,
    rareIds,
    totalMs: holdFromMs + holdMs,
    holdFromMs,
    quick,
  };
}

/** Which ids have landed `elapsedMs` into the timeline. */
export function landedAt(timeline: StageTimeline, elapsedMs: number): string[] {
  return timeline.order.filter(
    (id) => (timeline.landAt.get(id) ?? Number.POSITIVE_INFINITY) <= elapsedMs,
  );
}

/** The beat kind for a timeline position: windup → deal → hold. */
export function timelineBeatAt(
  timeline: StageTimeline,
  elapsedMs: number,
): "windup" | "deal" | "hold" {
  if (elapsedMs < timeline.windupMs) return "windup";
  if (elapsedMs < timeline.holdFromMs) return "deal";
  return "hold";
}

/** Stage input for every survivor (value + changed) — used by the engine, the harness and the control board header. */
export function stageInputs(
  survivors: readonly BatchStreamCat[],
  stages: BatchStage[],
  k: number,
  placeholders?: BatchTortiePlaceholders,
): StageCatInput[] {
  const stage = stages[k];
  return survivors.map((cat) => ({
    id: cat.id,
    value: stage ? stageValueFor(cat, stage) : null,
    changed: stage ? stageChanged(cat, stages, k, placeholders) : false,
  }));
}

export interface StageSummary {
  label: string;
  changedCount: number;
  unchangedCount: number;
  groups: BatchBeatGroup[];
  rareIds: string[];
}

/** Header/plaque facts without a timeline ("Stage 7/23 · WHITE PATCHES · 11 changed · rare #16"). */
export function summarizeStage(
  inputs: readonly StageCatInput[],
  stage: BatchStage,
): StageSummary {
  const { changedIds, unchangedIds, groups, rareIds } = splitStage(inputs);
  return {
    label: stage.label,
    changedCount: changedIds.length,
    unchangedCount: unchangedIds.length,
    groups,
    rareIds,
  };
}

/** Legacy phase word for looks that still branch on it. */
export function batchPhaseForBeat(
  kind: BatchBeatKind,
): "loading" | "revealing" | "awaitingCull" | "done" {
  switch (kind) {
    case "loading":
      return "loading";
    case "awaiting":
    case "verdict":
      return "awaitingCull";
    case "done":
      return "done";
    default:
      return "revealing";
  }
}

/** Anchor id for the leader lines of a stage (themes/traitAnchorMap.anchorForParam over the stage's param). */
export function stageAnchorParam(stage: BatchStage): string {
  switch (stage.type) {
    case "simple":
      switch (stage.param) {
        case "peltName":
        case "shading":
          return "pelt";
        case "reverse":
          return "back";
        case "poseName":
          return "sprite";
        default:
          return stage.param;
      }
    case "accessory":
      return "accessory";
    case "scar":
      return "scar";
    case "tortie-sub":
      return "tortie";
    default:
      return "pelt";
  }
}
