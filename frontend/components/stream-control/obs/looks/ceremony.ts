"use client";

import confetti from "canvas-confetti";
import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getArchetypeTheme } from "@/components/evolution/archetypes";

/**
 * Look-agnostic evolution ceremony driver. It walks the same steps as the
 * generator page's EvolutionCeremony (summon → per-branch banner → charge
 * with teaser frames → reveal → … → finale) and exposes the progress as a
 * LineageReveal that every look's lineage board renders in its own visual
 * language. Timing matches STEP_DURATIONS in EvolutionCeremony.tsx so the
 * control page's duration estimate and the reload policy stay valid.
 */

export type CeremonyStep =
  | { kind: "summon" }
  | { kind: "banner"; index: number }
  | { kind: "charge"; index: number }
  | { kind: "reveal"; index: number }
  | { kind: "waiting"; index: number }
  | { kind: "finale" };

export const CEREMONY_STEP_MS: Record<CeremonyStep["kind"], number> = {
  summon: 5000,
  banner: 3500,
  charge: 8400,
  reveal: 6000,
  waiting: 0,
  finale: 3500,
};

/** How fast the teaser frames cycle while a cat charges. */
const TEASER_CYCLE_MS = 130;

export interface CeremonyCatInput {
  key: string;
  label: string;
  level: number;
  branchLabel: string | null;
  archetype: string | null;
  previewUrl: string | null;
  /** What the cat gained; the reveal lingers a little longer per addition. */
  additions?: readonly unknown[];
}

/** Extra reveal time per addition, matching EvolutionCeremony's chip stagger. */
export const REVEAL_MS_PER_ADDITION = 180;

/**
 * How long a step holds before the ceremony advances. Same numbers as the
 * generator page's EvolutionCeremony: the charge uses the command's spin
 * length and a reveal grows by 180 ms per addition the cat shows.
 */
export function stepDurationMs(
  step: CeremonyStep,
  cats: readonly CeremonyCatInput[],
  chargeDurationMs: number,
): number {
  if (step.kind === "charge") return chargeDurationMs;
  const base = CEREMONY_STEP_MS[step.kind];
  if (step.kind !== "reveal") return base;
  const additions = cats[step.index]?.additions?.length ?? 0;
  return base + additions * REVEAL_MS_PER_ADDITION;
}

export interface LineageReveal {
  step: CeremonyStep;
  /** Cats drawn with their real sprite. */
  revealedKeys: ReadonlySet<string>;
  /** Branches whose banner has played (their section/trail may be drawn). */
  openBranches: ReadonlySet<string>;
  /** The cat the ceremony is on right now (banner, charge, reveal). */
  activeKey: string | null;
  activeBranch: string | null;
  /** Teaser frames are cycling on the active cat. */
  charging: boolean;
  /** The active cat was just revealed (play the landing). */
  revealing: boolean;
  /** Current teaser frame while charging. */
  teaserUrl: string | null;
  /** 0..1 progress through the whole ceremony. */
  progress: number;
  /** Length of a charge step, so boards can time walks and spins to it. */
  chargeMs: number;
  done: boolean;
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
  if (state === "charging") return reveal?.teaserUrl ?? previewUrl;
  if (state === "hidden") return null;
  return previewUrl;
}

function enterIndex(
  index: number,
  cats: readonly CeremonyCatInput[],
  totalCount: number,
): CeremonyStep {
  if (index >= totalCount) return { kind: "finale" };
  const cat = cats[index];
  if (!cat) return { kind: "waiting", index };
  const previous = cats[index - 1];
  if (cat.branchLabel !== previous?.branchLabel) {
    return { kind: "banner", index };
  }
  return { kind: "charge", index };
}

function nextStep(
  current: CeremonyStep,
  cats: readonly CeremonyCatInput[],
  totalCount: number,
): CeremonyStep {
  switch (current.kind) {
    case "summon":
      return enterIndex(1, cats, totalCount);
    case "banner":
      return { kind: "charge", index: current.index };
    case "charge":
      return { kind: "reveal", index: current.index };
    case "reveal":
      return enterIndex(current.index + 1, cats, totalCount);
    case "waiting":
      return enterIndex(current.index, cats, totalCount);
    case "finale":
      return current;
  }
}

/** Index of the cat the step is about; the summon is about the starter. */
function activeIndexOf(step: CeremonyStep): number | null {
  if (step.kind === "summon") return 0;
  return "index" in step ? step.index : null;
}

function revealedThrough(step: CeremonyStep, totalCount: number): number {
  if (step.kind === "finale") return totalCount;
  if (step.kind === "summon") return 1;
  if (step.kind === "reveal") return step.index + 1;
  return step.index;
}

export interface UseLineageCeremonyOptions {
  cats: readonly CeremonyCatInput[];
  totalCount: number;
  chargeDurationMs?: number;
  requestTeaserFrame?: (index: number) => Promise<string | null>;
  onFinish: () => void;
  /** Fire confetti in the branch colours on every reveal (default true). */
  confetti?: boolean;
  /** While false the ceremony is parked on its first step (no timers). */
  enabled?: boolean;
}

export function useLineageCeremony({
  cats,
  totalCount,
  chargeDurationMs = CEREMONY_STEP_MS.charge,
  requestTeaserFrame,
  onFinish,
  confetti: confettiEnabled = true,
  enabled = true,
}: UseLineageCeremonyOptions): LineageReveal {
  const prefersReducedMotion = useReducedMotion();
  const [step, setStep] = useState<CeremonyStep>({ kind: "summon" });
  const catsRef = useRef(cats);
  catsRef.current = cats;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const advance = useCallback(() => {
    setStep((current) => nextStep(current, catsRef.current, totalCount));
  }, [totalCount]);

  // Timed auto-advance for every animated step.
  useEffect(() => {
    if (!enabled) return;
    const duration = stepDurationMs(step, catsRef.current, chargeDurationMs);
    if (step.kind === "finale") {
      const timer = window.setTimeout(() => onFinishRef.current(), duration);
      return () => window.clearTimeout(timer);
    }
    if (duration <= 0) return;
    const timer = window.setTimeout(advance, duration);
    return () => window.clearTimeout(timer);
  }, [step, chargeDurationMs, advance, enabled]);

  // Resume from the waiting state as soon as the next cat is rendered.
  useEffect(() => {
    if (enabled && step.kind === "waiting" && cats[step.index]) advance();
  }, [step, cats, advance, enabled]);

  // Teaser frames: rendered sequentially while the charge spins, cycled on
  // a fixed beat so the sprite flickers between "could have been" variants.
  const [teaserFrames, setTeaserFrames] = useState<string[]>([]);
  const [teaserIndex, setTeaserIndex] = useState(0);
  useEffect(() => {
    setTeaserFrames([]);
    setTeaserIndex(0);
    if (!enabled || step.kind !== "charge" || !requestTeaserFrame) return;
    const chargeIndex = step.index;
    const frameCap = Math.min(
      60,
      Math.max(10, Math.floor(chargeDurationMs / 220)),
    );
    let cancelled = false;
    (async () => {
      for (let i = 0; i < frameCap; i += 1) {
        if (cancelled) return;
        try {
          const frame = await requestTeaserFrame(chargeIndex);
          if (cancelled) return;
          if (frame) setTeaserFrames((previous) => [...previous, frame]);
        } catch {
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, requestTeaserFrame, chargeDurationMs, enabled]);
  useEffect(() => {
    if (step.kind !== "charge" || teaserFrames.length < 2) return;
    const id = window.setInterval(
      () => setTeaserIndex((i) => i + 1),
      TEASER_CYCLE_MS,
    );
    return () => window.clearInterval(id);
  }, [step, teaserFrames.length]);

  // Confetti in the branch colours as each cat lands.
  useEffect(() => {
    if (step.kind !== "reveal" || !confettiEnabled || prefersReducedMotion)
      return;
    const cat = catsRef.current[step.index];
    const theme = getArchetypeTheme(cat?.archetype);
    const colors = [theme.from, theme.to, "#ffffff"];
    const origin = { x: 0.33, y: 0.55 };
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
  }, [step, confettiEnabled, prefersReducedMotion]);

  const through = revealedThrough(step, totalCount);
  const revealedKeys = new Set(cats.slice(0, through).map((cat) => cat.key));
  const activeIndex = activeIndexOf(step);
  const activeCat = activeIndex === null ? null : (cats[activeIndex] ?? null);
  const openBranches = new Set<string>();
  for (const cat of cats.slice(0, through)) {
    if (cat.branchLabel) openBranches.add(cat.branchLabel);
  }
  if (
    activeCat?.branchLabel &&
    (step.kind === "banner" || step.kind === "charge")
  ) {
    openBranches.add(activeCat.branchLabel);
  }
  const charging = step.kind === "charge";
  const teaserUrl =
    charging && teaserFrames.length
      ? teaserFrames[teaserIndex % teaserFrames.length]
      : null;

  return {
    step,
    revealedKeys,
    openBranches,
    activeKey: activeCat?.key ?? null,
    activeBranch: activeCat?.branchLabel ?? null,
    charging,
    revealing: step.kind === "reveal" || step.kind === "summon",
    teaserUrl,
    progress: Math.min(1, through / Math.max(1, totalCount)),
    chargeMs: chargeDurationMs,
    done: step.kind === "finale",
  };
}
