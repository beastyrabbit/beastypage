/**
 * Module-level constants and pure helpers for the stream control page,
 * extracted verbatim from StreamControlClient.tsx.
 */

import { stageRank } from "@/components/evolution/evolutionDisplay";
import {
  type BatchLiveState,
  type BatchStage,
  type BatchStreamCommand,
  buildBatchStagePlan,
} from "@/lib/adoption/streamBatch";
import { rollTraitLabel } from "@/lib/evolution/additionApply";
import {
  buildCeremonySchedule,
  type RollPhase,
  rollLandMs,
  rollNearMissMs,
  rollPhaseAt,
  scheduleCatsFromCommand,
  stepAt,
} from "@/lib/evolution/rollSchedule";
import {
  ceremonyElapsedMs,
  ceremonyPhaseForReload,
  type EvolutionLiveState,
  type EvolutionStreamCommand,
} from "@/lib/evolution/streamEvolution";
import {
  encodePortableSettings,
  extractPortableSettings,
} from "@/lib/portable-settings";
import { computeLayerCount } from "@/utils/catSettingsHelpers";
import type { SingleCatSettings } from "@/utils/singleCatVariants";
import type { ShowLookId } from "../obs/looks/lookMeta";
import type { StageSummary } from "../obs/scenes/batch/batchBeats";

export const LOBBY_MODE_DEFAULTS = {
  "fruit-ninja": { cats: 5, move: 1.5, swap: 1 },
  matrix: { cats: 8, move: 1, swap: 1 },
  dvd: { cats: 3, move: 0.5, swap: 1 },
  parade: { cats: 6, move: 1, swap: 1 },
  orbit: { cats: 6, move: 1, swap: 1 },
  bubbles: { cats: 8, move: 1, swap: 1 },
} as const;
export const FULL_EXPORT_SIZE = 700;
export type LobbyMode = keyof typeof LOBBY_MODE_DEFAULTS;
export type CanvasExportSource = HTMLCanvasElement | OffscreenCanvas;

export function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function isLobbyMode(value: unknown): value is LobbyMode {
  return typeof value === "string" && value in LOBBY_MODE_DEFAULTS;
}

export function isPaletteDisplayMode(value: unknown): value is "cycle" | "all" {
  return value === "cycle" || value === "all";
}

export function canvasToPngBlob(canvas: CanvasExportSource): Promise<Blob> {
  if ("convertToBlob" in canvas) {
    return (canvas as OffscreenCanvas).convertToBlob({ type: "image/png" });
  }

  return new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/png",
    );
  });
}

const ON_AIR_LABELS: Record<string, string> = {
  lobby: "Lobby",
  brb: "BRB",
  test: "Test",
  spin: "Spin",
  wheel: "Wheel",
  countdown: "Countdown",
  evolution: "Evolution",
  batch: "Batch",
};

/** Short label for what the overlay is showing right now, or null when idle/cleared. */
export function describeOnAir(
  session:
    | {
        status?: string | null;
        testMode?: boolean | null;
        currentCommand?: { type?: string | null } | null;
      }
    | null
    | undefined,
): string | null {
  if (!session) return null;
  if (session.testMode) return "Test";
  if (session.status !== "active") return null;
  const type = session.currentCommand?.type;
  return type ? (ON_AIR_LABELS[type] ?? null) : null;
}

/** Format a multiplier value like 1 -> "1x", 0.25 -> "0.25x", 2.50 -> "2.5x" */
export function formatMultiplier(v: number): string {
  const text = v.toFixed(2);
  // Drop trailing zeros, then the decimal point if nothing follows it.
  let end = text.length;
  while (end > 0 && text[end - 1] === "0") end--;
  if (end < text.length && text[end - 1] === ".") end--;
  return `${text.slice(0, end)}x`;
}

export function encodePortableCodeFromSettings(
  settings: SingleCatSettings,
): string {
  return encodePortableSettings(extractPortableSettings(settings));
}

/** Shared boundary so every Stream Control spin forwards registry rules. */
export function buildStreamGeneratorOptions(
  settings: SingleCatSettings,
): Record<string, unknown> {
  return {
    experimentalColourMode:
      settings.extendedModes.length > 0
        ? settings.extendedModes.filter((mode) => mode !== "base")
        : undefined,
    includeBaseColours: settings.includeBaseColours,
    includeNewSprites: settings.includeNewSprites,
    exactLayerCounts: settings.exactLayerCounts,
    accessoryCount: computeLayerCount(settings.accessoryRange),
    scarCount: computeLayerCount(settings.scarRange),
    tortieCount: computeLayerCount(settings.tortieRange),
  };
}

// ---------------------------------------------------------------------------
// Live show readouts (batch beat, evolution ledger, "is a show on air")
// ---------------------------------------------------------------------------

/** A verdict whose finalize never ran reads "stuck" this long after verdictAt. */
const VERDICT_STUCK_MS = 10_000;
/** Charge used when the command carries none (the generator page default). */
const DEFAULT_CHARGE_MS = 8400;

/** Seconds left on an armed verdict (3..0), null when none is armed. */
export function verdictSecondsLeft(
  verdictAt: number | null | undefined,
  now: number,
): number | null {
  if (typeof verdictAt !== "number") return null;
  return Math.min(3, Math.max(0, Math.ceil((verdictAt - now) / 1000)));
}

export interface BatchBeatReadout {
  /** "Stage 7/23" */
  stage: string;
  /** "WHITE PATCHES" */
  trait: string;
  /** "dealing" | "awaiting" | "verdict 2" | "verdict stuck" | "done" */
  beat: string;
  changed: number | null;
  /** "#16" (several: "#16 #21"), null when nothing is rare or no summary. */
  rare: string | null;
}

/** Parts of "Stage 7/23 · WHITE PATCHES · 11 changed · rare #16". */
export function describeBatchBeat(
  liveState: BatchLiveState | null,
  stages: readonly BatchStage[],
  summary: StageSummary | null,
  numberOf: (id: string) => string,
  now: number,
): BatchBeatReadout | null {
  if (!liveState) return null;
  const total = stages.length;
  const stage = stages[Math.min(liveState.stageIndex, total - 1)];
  const label = (summary?.label ?? stage?.label ?? "").toUpperCase();
  const beat = (() => {
    const { pendingCullId, verdictAt } = liveState;
    if (pendingCullId && typeof verdictAt === "number") {
      if (verdictAt > now)
        return `verdict ${verdictSecondsLeft(verdictAt, now)}`;
      if (verdictAt + VERDICT_STUCK_MS < now) return "verdict stuck";
    }
    if (liveState.awaitingCull) return "awaiting";
    if (liveState.stageIndex >= total) return "done";
    return "dealing";
  })();
  const rare =
    summary && summary.rareIds.length > 0
      ? summary.rareIds.map((id) => `#${numberOf(id)}`).join(" ")
      : null;
  return {
    stage: `Stage ${Math.min(liveState.stageIndex + 1, total)}/${total}`,
    trait: label,
    beat,
    changed: summary?.changedCount ?? null,
    rare,
  };
}

export interface EvolutionLedger {
  /** "Summon" | "Banner · Moss" | "Roll · ACCESSORY · 1/2" | "Reveal · Mosspaw" | "Finale" | "Board" */
  stepLabel: string;
  branch: string | null;
  rank: string | null;
  catLabel: string | null;
  roll: {
    index: number;
    count: number;
    traitLabel: string;
    phase: RollPhase;
  } | null;
  /** 0..1 of totalMs. */
  progress: number;
  /** totalMs − elapsed, ≥ 0. */
  etaMs: number;
  held: boolean;
  done: boolean;
  /** Elapsed ms of the current roll's near-miss start while still ahead of it (Hold parks here); null otherwise. */
  holdParkAtMs: number | null;
  /** Elapsed ms of the current roll's land start while still ahead of it ("Reveal now" target); null otherwise. */
  revealNowAtMs: number | null;
}

/** Where the themed ceremony is on the shared clock, for the control page. */
export function evolutionLedger(
  command: EvolutionStreamCommand & { timestamp: number; seq: number },
  state: EvolutionLiveState | null,
  now: number,
): EvolutionLedger {
  const schedule = buildCeremonySchedule(
    scheduleCatsFromCommand(command),
    command.totalCount,
    command.chargeDurationMs ?? DEFAULT_CHARGE_MS,
  );
  const live = state?.seq === command.seq ? state : null;
  const held = typeof live?.holdStartedAt === "number";
  const elapsed = live?.skipToBoard
    ? schedule.totalMs
    : ceremonyElapsedMs(now, command.timestamp, command.seq, live);
  const scheduled = stepAt(schedule, elapsed);
  const { step } = scheduled;
  const cat = "index" in step ? (command.cats[step.index] ?? null) : null;
  const branch = cat?.branchLabel ?? null;
  const catLabel = cat?.label ?? null;

  let stepLabel: string;
  let roll: EvolutionLedger["roll"] = null;
  let holdParkAtMs: number | null = null;
  let revealNowAtMs: number | null = null;
  switch (step.kind) {
    case "summon":
      stepLabel = "Summon";
      break;
    case "banner":
      stepLabel = `Banner · ${branch ?? catLabel ?? ""}`;
      break;
    case "roll": {
      const addition = cat?.additions?.[step.addition];
      const traitLabel = addition ? rollTraitLabel(addition) : "?";
      const { phase } = rollPhaseAt(
        elapsed - scheduled.startMs,
        scheduled.endMs - scheduled.startMs,
      );
      roll = { index: step.addition, count: step.count, traitLabel, phase };
      stepLabel = `Roll · ${traitLabel} · ${step.addition + 1}/${step.count}`;
      const nearMiss = rollNearMissMs(schedule, step.index, step.addition);
      const land = rollLandMs(schedule, step.index, step.addition);
      holdParkAtMs = nearMiss !== null && elapsed < nearMiss ? nearMiss : null;
      revealNowAtMs = land !== null && elapsed < land ? land : null;
      break;
    }
    case "reveal":
      stepLabel = `Reveal · ${catLabel ?? ""}`;
      break;
    case "finale":
      stepLabel = "Finale";
      break;
    case "done":
      stepLabel = "Board";
      break;
  }
  const { totalMs } = schedule;
  return {
    stepLabel,
    branch,
    rank: cat ? stageRank(cat.level) : null,
    catLabel,
    roll,
    progress: totalMs > 0 ? Math.min(1, Math.max(0, elapsed / totalMs)) : 1,
    etaMs: Math.max(0, totalMs - elapsed),
    held,
    done: step.kind === "done",
    holdParkAtMs,
    revealNowAtMs,
  };
}

/** Hold / Reveal now only drive the themed engine; the classic chamber runs on its own clock. */
export function pacingAvailable(showLook: ShowLookId): boolean {
  return showLook !== "classic";
}

/**
 * A batch show that is not done, or a ceremony whose clock is still inside
 * the schedule (and not skipped), is on air — Start buttons disable on it.
 */
export function isShowLive(
  session:
    | {
        currentCommand?: {
          type?: string;
          seq?: number;
          timestamp?: number;
          evolution?: unknown;
          batch?: unknown;
        } | null;
        batchState?: BatchLiveState | null;
        evolutionState?: EvolutionLiveState | null;
      }
    | null
    | undefined,
  now: number,
): boolean {
  const command = session?.currentCommand;
  if (!command || typeof command.seq !== "number") return false;
  if (command.type === "batch" && command.batch) {
    const batch = command.batch as BatchStreamCommand;
    const state = session?.batchState;
    const total = buildBatchStagePlan(batch.config, batch.cats).length;
    return !(state?.seq === command.seq && state.stageIndex >= total);
  }
  if (command.type === "evolution" && command.evolution) {
    const evolution = command.evolution as EvolutionStreamCommand;
    const state = session?.evolutionState;
    const live = state?.seq === command.seq ? state : null;
    const timestamp =
      typeof command.timestamp === "number" ? command.timestamp : now;
    // The effective clock already carries the offset and any hold, so it is
    // measured against the schedule itself (a forward "Reveal now" jump must
    // not shorten the bound a second time); a skip ends the show.
    return (
      ceremonyPhaseForReload(evolution, command.seq, timestamp, live, now) ===
      "ceremony"
    );
  }
  return false;
}
