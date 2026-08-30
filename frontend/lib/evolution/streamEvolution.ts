/**
 * Shared shape of the evolution command sent through
 * cat_stream_sessions.currentCommand.evolution: the control page generates
 * and persists the batch, then sends params-only cat data (never rendered
 * images — the session document is capped at 1 MiB) for the overlay to
 * re-render locally.
 */

import { catDataToLegacyPersistence } from "@/lib/cat-system";
import { estimateCeremonySecondsFromCounts } from "./ceremonyEstimate";
import type {
  EvolutionAddition,
  EvolutionArchetype,
  EvolutionCatData,
  EvolutionGeneratedCat,
} from "./evolutionGenerator";

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

/** Light runtime guard for command payloads coming out of Convex. */
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
 * Generous upper bound (ms) for how long the ceremony for this command
 * takes on the overlay — used to decide, after an overlay reload, whether
 * to replay the ceremony or jump straight to the lineage + QR finale.
 */
export function estimateEvolutionCommandMs(
  command: EvolutionStreamCommand,
): number {
  const evolutions = command.cats.filter((cat) => cat.level > 0).length;
  const branches = new Set(
    command.cats.map((cat) => cat.branchLabel).filter(Boolean),
  ).size;
  const spinSeconds = (command.chargeDurationMs ?? 8400) / 1000;
  const estimateSeconds = estimateCeremonySecondsFromCounts(
    Math.max(branches, 1),
    evolutions,
    spinSeconds,
  );
  // 25% slack + 15s for module loading and sprite rendering.
  return estimateSeconds * 1250 + 15_000;
}
