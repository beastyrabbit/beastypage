"use client";

import confetti from "canvas-confetti";
import { useReducedMotion } from "motion/react";
import {
  type RefObject,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { getArchetypeTheme } from "@/components/evolution/archetypes";
import { rollTraitLabel, rollValueLabel } from "@/lib/evolution/additionApply";
import type { EvolutionAddition } from "@/lib/evolution/evolutionGenerator";
import {
  buildCandidateOrder,
  buildCeremonySchedule,
  CEREMONY_MS,
  type CeremonySchedule,
  type CeremonyStep,
  type RollPhase,
  type RollPhaseState,
  rollBudgetMs,
  rollLandMs,
  rollPhaseAt,
  rollSeed,
  type ScheduledStep,
  stepAt,
} from "@/lib/evolution/rollSchedule";
import {
  ceremonyElapsedMs,
  type EvolutionLiveState,
} from "@/lib/evolution/streamEvolution";

/**
 * Look-agnostic evolution ceremony driver. The show is a schedule in elapsed
 * ms (lib/evolution/rollSchedule.ts) evaluated against the shared ceremony
 * clock (command timestamp, server offset, hold), so the OBS source and the
 * preview iframe agree on the step, the roll phase and the strobe frame
 * without talking to each other. Exposed as a LineageReveal every look's
 * lineage board renders in its own visual language.
 */

export type {
  CeremonySchedule,
  CeremonyStep,
  RollPhase,
  ScheduledStep,
} from "@/lib/evolution/rollSchedule";
export { CEREMONY_MS } from "@/lib/evolution/rollSchedule";

/** Kept for the chamber + tests; values now come from CEREMONY_MS (overlay pacing). */
export const CEREMONY_STEP_MS = {
  summon: 3000,
  banner: 2000,
  reveal: 2000,
  finale: 3500,
} as const;
export const REVEAL_MS_PER_ADDITION = 180;

/** Default charge when the command carries none. */
const DEFAULT_CHARGE_MS = 8400;
const TICK_MS = 50;
/** Rolls whose frames are requested ahead: the current one and the next two. */
const PRERENDER_ROLLS = 3;

export interface CeremonyCatInput {
  key: string;
  label: string;
  level: number;
  branchLabel: string | null;
  archetype: string | null;
  previewUrl: string | null;
  additions?: readonly EvolutionAddition[];
  /** The parent's finished sprite: what this cat looked like before its first roll. */
  parentUrl?: string | null;
}

export interface LineageRoll {
  catKey: string;
  /** "ACCESSORY", "TORTIE", … (rollTraitLabel). */
  traitLabel: string;
  /** 0-based addition index and the cat's addition count. */
  index: number;
  count: number;
  phase: RollPhase;
  /** Full-word value: null before the land phase, set from the land phase on and kept through reveal(i). */
  valueLabel: string | null;
  candidateCount: number;
  /** 0..1 through this roll (1 while frozen during reveal). */
  progress: number;
}

export interface LineageReveal {
  step: CeremonyStep;
  /** Cats drawn with their real sprite. */
  revealedKeys: ReadonlySet<string>;
  /** Branches whose banner has played (their section/trail may be drawn). */
  openBranches: ReadonlySet<string>;
  /** The cat the ceremony is on right now (banner, roll, reveal). */
  activeKey: string | null;
  activeBranch: string | null;
  /** step.kind === "roll" (kept name: the looks branch on it). */
  charging: boolean;
  /** step.kind === "reveal" || "summon". */
  revealing: boolean;
  /** Frame to draw on the active cat: the strobe candidate while rolling, the landed frame from the land phase on and through reveal(i), null otherwise. */
  teaserUrl: string | null;
  /**
   * What the active cat looked like before the current roll: the previous
   * addition's landed frame, else the parent's sprite. Drawn while rolling
   * whenever no candidate frame is ready yet, so the finished cat never
   * shows before its land.
   */
  baseUrl: string | null;
  /** 0..1 progress through the whole ceremony. */
  progress: number;
  /** Budget of the CURRENT roll, or rollBudgetMs(chargeMs, 1) outside a roll (look timers never see undefined). */
  chargeMs: number;
  done: boolean;
  /**
   * The current roll while step.kind === "roll"; during reveal(i) the LAST
   * roll of cat i frozen at land so valueLabel survives the reveal. null for
   * a 0-addition cat and outside roll/reveal.
   */
  roll: LineageRoll | null;
  /** Values landed so far on the active cat; all of them during reveal(i); [] otherwise. */
  landedValues: readonly string[];
  /** Set from the first land phase of cat i through reveal(i): the cat and the SCHEDULED elapsed ms of its latest land. */
  landing: { key: string; at: number } | null;
  clock: { elapsedMs: number; totalMs: number };
  held: boolean;
  reducedMotion: boolean;
}

export type LineageCatState = "shown" | "hidden" | "charging" | "revealing";

/** How a board should draw one cat given the ceremony progress. */
export function lineageCatState(
  reveal: LineageReveal | undefined,
  key: string,
): LineageCatState {
  if (!reveal) return "shown";
  if (reveal.revealedKeys.has(key)) {
    return reveal.activeKey === key && reveal.revealing ? "revealing" : "shown";
  }
  if (reveal.activeKey === key && reveal.charging) return "charging";
  return "hidden";
}

/** A branch's chrome (heading, trail, roll) is drawn once its banner played. */
export function lineageBranchOpen(
  reveal: LineageReveal | undefined,
  branchLabel: string,
): boolean {
  return !reveal || reveal.openBranches.has(branchLabel);
}

/** Sprite URL to draw for a cat in the given state. */
export function lineageSpriteUrl(
  state: LineageCatState,
  reveal: LineageReveal | undefined,
  previewUrl: string | null,
): string | null {
  if (state === "charging") return reveal?.teaserUrl ?? reveal?.baseUrl ?? null;
  if (state === "hidden") return null;
  return previewUrl;
}

/** Index of the cat the step is about; the summon is about the starter. */
function activeIndexOf(step: CeremonyStep): number | null {
  if (step.kind === "summon") return 0;
  return "index" in step ? step.index : null;
}

function revealedThrough(step: CeremonyStep, totalCount: number): number {
  if (step.kind === "finale" || step.kind === "done") return totalCount;
  if (step.kind === "summon") return 1;
  if (step.kind === "reveal") return step.index + 1;
  return step.index;
}

interface RollFrames {
  candidates: string[];
  landed: string | null;
}

function rollKeyOf(catKey: string, addition: number): string {
  return `${catKey}:${addition.toString()}`;
}

type RollStep = Extract<CeremonyStep, { kind: "roll" }>;
type RevealStep = Extract<CeremonyStep, { kind: "reveal" }>;

/** The parts of a LineageReveal that depend on the roll/reveal step. */
interface StepReveal {
  roll: LineageRoll | null;
  teaserUrl: string | null;
  baseUrl: string | null;
  landedValues: string[];
  landing: LineageReveal["landing"];
}

/** What the roll/reveal helpers read: the clock, the active cat and its frames. */
interface RevealContext {
  schedule: CeremonySchedule;
  scheduled: ScheduledStep;
  elapsed: number;
  reducedMotion: boolean;
  cat: CeremonyCatInput;
  frames: ReadonlyMap<string, RollFrames>;
  orderFor: (
    catKey: string,
    addition: number,
    frameCount: number,
    candidateCount: number,
  ) => number[];
}

function idleStepReveal(): StepReveal {
  return {
    roll: null,
    teaserUrl: null,
    baseUrl: null,
    landedValues: [],
    landing: null,
  };
}

/** The cat the step is about, when the command has it. */
function activeCatOf(
  cats: readonly CeremonyCatInput[],
  step: CeremonyStep,
): CeremonyCatInput | null {
  const index = activeIndexOf(step);
  return index === null ? null : (cats[index] ?? null);
}

/** Branches of the revealed cats, plus the active cat's while its banner or roll plays. */
function openBranchesFor(
  cats: readonly CeremonyCatInput[],
  through: number,
  activeCat: CeremonyCatInput | null,
  step: CeremonyStep,
): Set<string> {
  const open = new Set<string>();
  for (const cat of cats.slice(0, through)) {
    if (cat.branchLabel) open.add(cat.branchLabel);
  }
  if (
    activeCat?.branchLabel &&
    (step.kind === "banner" || step.kind === "roll")
  ) {
    open.add(activeCat.branchLabel);
  }
  return open;
}

/** The active cat and the SCHEDULED elapsed ms of its `addition` land (the step start when unknown). */
function landingAt(
  ctx: RevealContext,
  catIndex: number,
  addition: number,
): LineageReveal["landing"] {
  return {
    key: ctx.cat.key,
    at: rollLandMs(ctx.schedule, catIndex, addition) ?? ctx.scheduled.startMs,
  };
}

/** What the cat looked like before this roll: the previous roll's landed frame, else the parent. */
function rollBaseUrl(ctx: RevealContext, step: RollStep): string | null {
  const previous =
    step.addition > 0
      ? ctx.frames.get(rollKeyOf(ctx.cat.key, step.addition - 1))
      : undefined;
  return previous?.landed ?? ctx.cat.parentUrl ?? null;
}

/** Frame on the active cat: the landed frame from the land phase on, else the strobe candidate once frames are ready. */
function rollTeaserUrl(
  ctx: RevealContext,
  step: RollStep,
  phase: RollPhaseState,
  frames: RollFrames | undefined,
): string | null {
  if (phase.phase === "land") return frames?.landed ?? null;
  const candidateCount = frames?.candidates.length ?? 0;
  if (phase.frameIndex < 0 || !frames || candidateCount <= 0) return null;
  const order = ctx.orderFor(
    ctx.cat.key,
    step.addition,
    phase.frameCount,
    candidateCount,
  );
  return frames.candidates[order[phase.frameIndex] ?? 0] ?? null;
}

/** Reveal during roll (i, j): phase, strobe/landed frame and the values landed so far. */
function rollStepReveal(ctx: RevealContext, step: RollStep): StepReveal {
  const { cat, scheduled } = ctx;
  const additions = cat.additions ?? [];
  const phase = rollPhaseAt(
    ctx.elapsed - scheduled.startMs,
    scheduled.endMs - scheduled.startMs,
    ctx.reducedMotion,
  );
  const addition = additions[step.addition];
  const frames = ctx.frames.get(rollKeyOf(cat.key, step.addition));
  const landed = phase.phase === "land";
  const landedCount = step.addition + (landed ? 1 : 0);
  return {
    roll: {
      catKey: cat.key,
      traitLabel: addition ? rollTraitLabel(addition) : "?",
      index: step.addition,
      count: step.count,
      phase: phase.phase,
      valueLabel: landed && addition ? rollValueLabel(addition) : null,
      candidateCount: frames?.candidates.length ?? 0,
      progress: phase.progress,
    },
    teaserUrl: rollTeaserUrl(ctx, step, phase, frames),
    baseUrl: rollBaseUrl(ctx, step),
    landedValues: additions.slice(0, landedCount).map(rollValueLabel),
    landing:
      landedCount > 0 ? landingAt(ctx, step.index, landedCount - 1) : null,
  };
}

/** Reveal during reveal(i): the last roll frozen at land so its value survives the reveal. */
function revealStepReveal(ctx: RevealContext, step: RevealStep): StepReveal {
  const { cat } = ctx;
  const additions = cat.additions ?? [];
  const count = additions.length;
  const landedValues = additions.map(rollValueLabel);
  if (count === 0) {
    return {
      ...idleStepReveal(),
      landedValues,
      landing: { key: cat.key, at: ctx.scheduled.startMs },
    };
  }
  const last = additions[count - 1];
  const frames = ctx.frames.get(rollKeyOf(cat.key, count - 1));
  return {
    roll: {
      catKey: cat.key,
      traitLabel: rollTraitLabel(last),
      index: count - 1,
      count,
      phase: "land",
      valueLabel: rollValueLabel(last),
      candidateCount: frames?.candidates.length ?? 0,
      progress: 1,
    },
    teaserUrl: frames?.landed ?? null,
    baseUrl: null,
    landedValues,
    landing: landingAt(ctx, step.index, count - 1),
  };
}

/** The step-dependent part of the reveal; idle outside roll/reveal or without an active cat. */
function stepRevealFor(
  step: CeremonyStep,
  ctx: RevealContext | null,
): StepReveal {
  if (!ctx) return idleStepReveal();
  if (step.kind === "roll") return rollStepReveal(ctx, step);
  if (step.kind === "reveal") return revealStepReveal(ctx, step);
  return idleStepReveal();
}

export interface UseLineageCeremonyOptions {
  cats: readonly CeremonyCatInput[];
  totalCount: number;
  chargeDurationMs?: number;
  /** Command timestamp (server ms); the clock runs from here. */
  startedAt: number;
  seq: number;
  /** Session evolutionState (hold/offset/skip); null when absent. */
  liveState: EvolutionLiveState | null;
  /**
   * Frames for one roll: resolves { candidates, landed } (data URLs). The hook
   * calls it for the current roll and the next TWO rolls and caches by
   * `${catKey}:${addition}`; a rejected request is retried on the next step.
   */
  requestRollFrames?: (
    catIndex: number,
    addition: number,
    seed: number,
  ) => Promise<{ candidates: string[]; landed: string | null }>;
  onFinish: () => void;
  /** Engine confetti at the landing cat; false for looks in LOOK_ERUPTS_IN_MATERIAL. */
  confetti?: boolean;
  /** Element the wrapper measures [data-lineage-key] rects in (confetti origin). */
  containerRef?: RefObject<HTMLElement | null>;
  /**
   * false ⇒ no interval; the hook evaluates stepAt(schedule, clockOverrideMs ?? totalMs)
   * once and returns that reveal (at totalMs: step "done", every key revealed, done: true).
   */
  enabled?: boolean;
  /** Harness: freeze the clock at this elapsed ms. */
  clockOverrideMs?: number | null;
  /** Harness `rm=1`: forces the reduced path instead of useReducedMotion(). */
  reducedMotionOverride?: boolean;
}

export function useLineageCeremony({
  cats,
  totalCount,
  chargeDurationMs = DEFAULT_CHARGE_MS,
  startedAt,
  seq,
  liveState,
  requestRollFrames,
  onFinish,
  confetti: confettiEnabled = true,
  containerRef,
  enabled = true,
  clockOverrideMs = null,
  reducedMotionOverride,
}: UseLineageCeremonyOptions): LineageReveal {
  const prefersReducedMotion = useReducedMotion();
  const reducedMotion = reducedMotionOverride ?? Boolean(prefersReducedMotion);
  const catsRef = useRef(cats);
  catsRef.current = cats;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const liveStateRef = useRef(liveState);
  liveStateRef.current = liveState;

  // The schedule depends on keys, branches and addition counts only — not on
  // the cats array identity (callers rebuild it every render).
  const scheduleKey = cats
    .map(
      (cat) =>
        `${cat.key}|${cat.branchLabel ?? ""}|${(cat.additions?.length ?? 0).toString()}`,
    )
    .join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: scheduleKey stands in for cats
  const schedule = useMemo(
    () =>
      buildCeremonySchedule(
        catsRef.current.map((cat) => ({
          key: cat.key,
          branchLabel: cat.branchLabel,
          additionCount: cat.additions?.length ?? 0,
        })),
        totalCount,
        chargeDurationMs,
      ),
    [scheduleKey, totalCount, chargeDurationMs],
  );

  // Clock: ticked while enabled, frozen by the harness, parked at the end otherwise.
  const clockFrozen = clockOverrideMs !== null && clockOverrideMs !== undefined;
  const [tickedMs, setTickedMs] = useState(() =>
    ceremonyElapsedMs(Date.now(), startedAt, seq, liveState),
  );
  let elapsed = schedule.totalMs;
  if (clockFrozen) elapsed = clockOverrideMs;
  else if (enabled) elapsed = tickedMs;
  const scheduled = stepAt(schedule, elapsed);
  const step = scheduled.step;
  const done = step.kind === "done";

  useEffect(() => {
    if (!enabled || clockFrozen || done) return;
    const tick = () =>
      setTickedMs(
        ceremonyElapsedMs(Date.now(), startedAt, seq, liveStateRef.current),
      );
    tick();
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
  }, [enabled, clockFrozen, done, startedAt, seq]);

  // onFinish once per arrival at "done".
  const finishedRef = useRef(false);
  useEffect(() => {
    if (!done) {
      finishedRef.current = false;
      return;
    }
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinishRef.current();
  }, [done]);

  // Roll frames: requested for the current roll and the next two, cached by
  // roll key; late results are still cached (the reveal reads `landed`).
  const framesRef = useRef(new Map<string, RollFrames>());
  const pendingRef = useRef(new Set<string>());
  const [, bumpFrames] = useReducer((version: number) => version + 1, 0);
  const stepIndex = done
    ? schedule.steps.length
    : schedule.steps.indexOf(scheduled);
  useEffect(() => {
    if (done || !requestRollFrames || (!enabled && !clockFrozen)) return;
    const upcoming: Extract<CeremonyStep, { kind: "roll" }>[] = [];
    for (
      let i = Math.max(0, stepIndex);
      i < schedule.steps.length && upcoming.length < PRERENDER_ROLLS;
      i += 1
    ) {
      const candidate = schedule.steps[i].step;
      if (candidate.kind === "roll") upcoming.push(candidate);
    }
    for (const roll of upcoming) {
      const cat = catsRef.current[roll.index];
      if (!cat) continue;
      const key = rollKeyOf(cat.key, roll.addition);
      if (framesRef.current.has(key) || pendingRef.current.has(key)) continue;
      pendingRef.current.add(key);
      requestRollFrames(
        roll.index,
        roll.addition,
        rollSeed(seq, cat.key, roll.addition),
      )
        .then((frames) => {
          framesRef.current.set(key, {
            candidates: [...frames.candidates],
            landed: frames.landed,
          });
          bumpFrames();
        })
        .catch((error) => {
          console.warn("[ceremony] roll frames failed", key, error);
        })
        .finally(() => {
          pendingRef.current.delete(key);
        });
    }
  }, [done, enabled, clockFrozen, requestRollFrames, schedule, stepIndex, seq]);

  // Strobe order per roll, pure in (seed, frameCount, candidateCount).
  const ordersRef = useRef(new Map<string, number[]>());
  const orderFor = (
    catKey: string,
    addition: number,
    frameCount: number,
    candidateCount: number,
  ): number[] => {
    const key = `${rollKeyOf(catKey, addition)}:${frameCount.toString()}:${candidateCount.toString()}`;
    let order = ordersRef.current.get(key);
    if (!order) {
      order = buildCandidateOrder(
        rollSeed(seq, catKey, addition),
        frameCount,
        candidateCount,
      );
      ordersRef.current.set(key, order);
    }
    return order;
  };

  const activeCat = activeCatOf(cats, step);
  const through = revealedThrough(step, totalCount);
  const revealedKeys = new Set(cats.slice(0, through).map((cat) => cat.key));
  const openBranches = openBranchesFor(cats, through, activeCat, step);
  const context: RevealContext | null = activeCat
    ? {
        schedule,
        scheduled,
        elapsed,
        reducedMotion,
        cat: activeCat,
        frames: framesRef.current,
        orderFor,
      }
    : null;
  const { roll, teaserUrl, baseUrl, landedValues, landing } = stepRevealFor(
    step,
    context,
  );
  const chargeMs =
    step.kind === "roll" && activeCat
      ? scheduled.endMs - scheduled.startMs
      : rollBudgetMs(chargeDurationMs, 1);

  // Confetti in the branch colours on each land, from the landing cat's rect.
  // Only a FRESH land fires (a reload mid-ceremony must not burst on mount).
  const landingKey = landing ? `${landing.key}:${landing.at.toString()}` : null;
  const freshLanding =
    landing !== null && elapsed - landing.at < CEREMONY_MS.land;
  const confettiArmed =
    freshLanding &&
    confettiEnabled &&
    !reducedMotion &&
    enabled &&
    !clockFrozen;
  // biome-ignore lint/correctness/useExhaustiveDependencies: one burst per landing key
  useEffect(() => {
    if (!landingKey || !confettiArmed) return;
    const cat = catsRef.current.find((entry) => entry.key === landing?.key);
    const theme = getArchetypeTheme(cat?.archetype ?? null);
    const colors = [theme.from, theme.to, "#ffffff"];
    const target = landing
      ? containerRef?.current?.querySelector(
          `[data-lineage-key="${landing.key}"]`,
        )
      : null;
    const rect = target?.getBoundingClientRect();
    const origin =
      rect && rect.width > 0 && window.innerWidth > 0 && window.innerHeight > 0
        ? {
            x: (rect.left + rect.width / 2) / window.innerWidth,
            y: (rect.top + rect.height / 2) / window.innerHeight,
          }
        : { x: 0.33, y: 0.55 };
    confetti({
      particleCount: 48,
      spread: 75,
      startVelocity: 26,
      scalar: 0.9,
      colors,
      origin,
      disableForReducedMotion: true,
      zIndex: 40,
    });
    const encore = window.setTimeout(() => {
      confetti({
        particleCount: 72,
        spread: 110,
        startVelocity: 34,
        scalar: 0.85,
        colors,
        origin,
        disableForReducedMotion: true,
        zIndex: 40,
      });
    }, 200);
    return () => window.clearTimeout(encore);
  }, [landingKey]);

  const held =
    liveState?.seq === seq && typeof liveState.holdStartedAt === "number";

  return {
    step,
    revealedKeys,
    openBranches,
    activeKey: activeCat?.key ?? null,
    activeBranch: activeCat?.branchLabel ?? null,
    charging: step.kind === "roll",
    revealing: step.kind === "reveal" || step.kind === "summon",
    teaserUrl,
    baseUrl,
    progress: Math.min(1, through / Math.max(1, totalCount)),
    chargeMs,
    done,
    roll,
    landedValues,
    landing,
    clock: { elapsedMs: elapsed, totalMs: schedule.totalMs },
    held,
    reducedMotion,
  };
}
