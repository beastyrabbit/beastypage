/**
 * Shared shape of the evolution command sent through
 * cat_stream_sessions.currentCommand.evolution: the control page generates
 * and persists the batch, then sends params-only cat data (never rendered
 * images — the session document is capped at 1 MiB) for the overlay to
 * re-render locally.
 */

import { catDataToLegacyPersistence } from "@/lib/cat-system";
import type {
  EvolutionAddition,
  EvolutionArchetype,
  EvolutionCatData,
  EvolutionGeneratedCat,
} from "./evolutionGenerator";
import { buildCeremonySchedule, scheduleCatsFromCommand } from "./rollSchedule";

export type EvolutionStreamCat = {
  key: string;
  label: string;
  level: number;
  branchLabel: string | null;
  archetype: EvolutionArchetype | null;
  additions: EvolutionAddition[];
  catData: EvolutionCatData;
};

export type EvolutionStreamCommand = {
  /** Slug of the saved batch — the overlay QR links to /evolution/[slug]. */
  slug: string;
  /** Total cats including the starter. */
  totalCount: number;
  /** Charge (spin) duration per evolution in ms. */
  chargeDurationMs?: number;
  /** Ordered cats, starter first — params only, no rendered previews. */
  cats: EvolutionStreamCat[];
};

/** Charge used when the command carries none (the generator page default). */
const DEFAULT_CHARGE_MS = 8400;

/** Hold auto-releases after this; postgresql/catStream.ts keeps HOLD_MAX_MS = 90000 in sync. */
export const EVOLUTION_HOLD_MAX_MS = 90_000;

/** cat_stream_sessions.evolutionState as the overlay and control page read it. */
export type EvolutionLiveState = {
  seq: number;
  /** Signed ms subtracted from the wall clock. Set ABSOLUTELY by the server (hold-with-park, reveal-at); released holds fold in (+). */
  offsetMs: number;
  /** Server ms the current hold began; absent when not held. `| null` only because the control page spreads partial objects; the server never writes null. */
  holdStartedAt?: number | null;
  /** The streamer skipped the rest of the ceremony. */
  skipToBoard?: boolean;
};

/** Strip generated cats down to what the overlay needs (drops `rolls`). */
export function toEvolutionStreamCats(
  orderedCats: EvolutionGeneratedCat[],
): EvolutionStreamCat[] {
  return orderedCats.map((cat) => ({
    key: cat.key,
    label: cat.label,
    level: cat.level,
    branchLabel: cat.branchLabel,
    archetype: cat.archetype,
    additions: cat.additions,
    catData: catDataToLegacyPersistence(
      cat.catData as unknown as Record<string, unknown>,
    ) as unknown as EvolutionCatData,
  }));
}

/** Light runtime guard for command payloads coming out of PostgreSQL. */
export function parseEvolutionStreamCommand(
  value: unknown,
): EvolutionStreamCommand | null {
  if (!value || typeof value !== "object") return null;
  const command = value as Partial<EvolutionStreamCommand>;
  if (
    typeof command.slug !== "string" ||
    typeof command.totalCount !== "number" ||
    !Array.isArray(command.cats) ||
    command.cats.length === 0
  ) {
    return null;
  }
  return command as EvolutionStreamCommand;
}

/**
 * Reads `session.evolutionState` off any session-shaped object. The overlay
 * receives the session document untyped for this field until the schema
 * carries it; a malformed value reads as "absent".
 */
export function readEvolutionLiveState(
  session: unknown,
): EvolutionLiveState | null {
  if (!session || typeof session !== "object") return null;
  const raw = (session as { evolutionState?: unknown }).evolutionState;
  if (!raw || typeof raw !== "object") return null;
  const state = raw as Partial<EvolutionLiveState>;
  if (typeof state.seq !== "number") return null;
  return {
    seq: state.seq,
    offsetMs: typeof state.offsetMs === "number" ? state.offsetMs : 0,
    ...(typeof state.holdStartedAt === "number"
      ? { holdStartedAt: state.holdStartedAt }
      : {}),
    ...(state.skipToBoard ? { skipToBoard: true } : {}),
  };
}

/**
 * Ceremony clock both overlay instances and the control page agree on:
 * now − commandTimestamp − offsetMs − (held ? min(now − holdStartedAt, EVOLUTION_HOLD_MAX_MS) : 0).
 * Clamped at 0. When state.seq !== seq the state is ignored.
 */
export function ceremonyElapsedMs(
  now: number,
  commandTimestamp: number,
  seq: number,
  state: EvolutionLiveState | null | undefined,
): number {
  const live = state?.seq === seq ? state : null;
  const offset = live?.offsetMs ?? 0;
  const held =
    typeof live?.holdStartedAt === "number"
      ? Math.min(Math.max(0, now - live.holdStartedAt), EVOLUTION_HOLD_MAX_MS)
      : 0;
  return Math.max(0, now - commandTimestamp - offset - held);
}

function scheduleFor(command: EvolutionStreamCommand) {
  return buildCeremonySchedule(
    scheduleCatsFromCommand(command),
    command.totalCount,
    command.chargeDurationMs ?? DEFAULT_CHARGE_MS,
  );
}

/** Reload policy: "tree" once the clock is past the schedule or the streamer skipped, else "ceremony". */
export function ceremonyPhaseForReload(
  command: EvolutionStreamCommand,
  seq: number,
  commandTimestamp: number,
  state: EvolutionLiveState | null | undefined,
  now: number,
): "ceremony" | "tree" {
  if (state?.seq === seq && state.skipToBoard) return "tree";
  const elapsed = ceremonyElapsedMs(now, commandTimestamp, seq, state);
  return elapsed >= scheduleFor(command).totalMs ? "tree" : "ceremony";
}

/**
 * Wall-clock upper bound (ms) for the whole show: compare it with
 * `now − command.timestamp` only. It already folds in the offset and an open
 * hold, so never measure `ceremonyElapsedMs` (the effective clock) against
 * it; that clock belongs with the schedule total (`ceremonyPhaseForReload`).
 */
export function estimateEvolutionCommandMs(
  command: EvolutionStreamCommand,
  state?: EvolutionLiveState | null,
): number {
  return (
    scheduleFor(command).totalMs +
    (state?.offsetMs ?? 0) +
    (state?.holdStartedAt ? EVOLUTION_HOLD_MAX_MS : 0)
  );
}
