/**
 * The batch adoption show as every look sees it: the full pool with each
 * cat's live state (eliminated at which stage, marked, potential, favourite,
 * spotlight) plus stage progress and the finale QR. Pure, so the looks can
 * be unit-tested and previewed without Convex or the renderer.
 */

import type { BatchStage, BatchStreamCat } from "@/lib/adoption/streamBatch";
import type { CatParams } from "@/lib/cat-v3/types";

export type BatchPhase = "loading" | "revealing" | "awaitingCull" | "done";

export interface BatchBoardCat {
  id: string;
  label: string;
  previewUrl: string | null;
  params: CatParams;
  eliminated: boolean;
  /** 1-based stage at which the cat left; null while still in the pool. */
  eliminatedAtStage: number | null;
  /** Just culled — still on the board, leaving. */
  fading: boolean;
  marked: boolean;
  potential: boolean;
  favorite: boolean;
  spotlight: boolean;
}

export interface BatchBoardStage {
  id: string;
  label: string;
  /** Revealed on the survivors (index < stageIndex, or == while revealing). */
  revealed: boolean;
  /** The stage currently being revealed or waited on. */
  current: boolean;
}

export interface BatchBoardModel {
  title: string;
  phase: BatchPhase;
  statusLabel: string;
  saved: boolean;
  stageIndex: number;
  stages: BatchBoardStage[];
  /** Cats still in the pool (fading cats count as gone). */
  remaining: number;
  finalCount: number;
  poolCount: number;
  /** Every cat in pool order. */
  cats: BatchBoardCat[];
  /** Cats to draw on the board: in the pool, or fading out. */
  survivors: BatchBoardCat[];
  /** Cats that left, in elimination order. */
  eliminated: BatchBoardCat[];
  spotlight: BatchBoardCat | null;
  /** Finale link once the litter is saved, else null. */
  qrUrl: string | null;
}

export interface BatchBoardInput {
  title: string | undefined;
  cats: readonly BatchStreamCat[];
  finalCount: number;
  saved: boolean;
  stages: readonly Pick<BatchStage, "id" | "label">[];
  phase: BatchPhase;
  stageIndex: number;
  previews: Readonly<Record<string, { url: string } | undefined>>;
  eliminatedIds: readonly string[];
  fadingId: string | null;
  markedId: string | null;
  potentialIds: readonly string[];
  favoriteIds: readonly string[];
  spotlightId: string | null;
  qrUrl: string | null;
}

/**
 * The stages a header strip should list. Short plans show every stage;
 * long ones (the default show has 15–23) show a window around the current
 * stage so the strip never runs off the board: the last few revealed, the
 * current one, and the next couple, with `…` markers where stages are
 * skipped.
 */
export function stageStripWindow(
  stages: readonly BatchBoardStage[],
  max = 8,
): BatchBoardStage[] {
  if (stages.length <= max) return [...stages];
  // Once the show is done no stage is current: anchor on the last one so
  // the strip shows what just finished, not the opening stages.
  const currentIndex = stages.findIndex((stage) => stage.current);
  const current = currentIndex === -1 ? stages.length - 1 : currentIndex;
  const before = Math.min(current, Math.floor((max - 1) * 0.6));
  const start = Math.max(0, Math.min(current - before, stages.length - max));
  const end = Math.min(stages.length, start + max);
  const window = stages.slice(start, end);
  const ellipsis = (id: string): BatchBoardStage => ({
    id,
    label: "…",
    revealed: true,
    current: false,
  });
  return [
    ...(start > 0 ? [ellipsis("strip-before")] : []),
    ...window,
    ...(end < stages.length
      ? [{ ...ellipsis("strip-after"), revealed: false }]
      : []),
  ];
}

export function batchStatusLabel(
  phase: BatchPhase,
  saved: boolean,
  stageLabel: string,
): string {
  if (phase === "loading") return "Summoning…";
  if (phase === "done") return saved ? "✨ Complete ✨" : "Saving…";
  if (phase === "awaitingCull") return "Choosing who leaves…";
  return `Rolling ${stageLabel}…`;
}

export function buildBatchBoardModel(input: BatchBoardInput): BatchBoardModel {
  const eliminatedOrder = new Map(
    input.eliminatedIds.map((id, index) => [id, index + 1]),
  );
  const potential = new Set(input.potentialIds);
  const favorite = new Set(input.favoriteIds);
  const awaiting = input.phase === "awaitingCull";

  const cats: BatchBoardCat[] = input.cats.map((cat) => {
    const eliminatedAtStage = eliminatedOrder.get(cat.id) ?? null;
    const marked = awaiting && cat.id === input.markedId;
    return {
      id: cat.id,
      label: cat.label,
      previewUrl: input.previews[cat.id]?.url ?? null,
      params: cat.catData.params,
      eliminated: eliminatedAtStage !== null,
      eliminatedAtStage,
      fading: cat.id === input.fadingId,
      marked,
      potential: !marked && potential.has(cat.id),
      favorite: favorite.has(cat.id),
      spotlight: cat.id === input.spotlightId,
    };
  });
  const survivors = cats.filter((cat) => !cat.eliminated || cat.fading);
  const eliminated = cats
    .filter((cat) => cat.eliminated)
    .sort((a, b) => (a.eliminatedAtStage ?? 0) - (b.eliminatedAtStage ?? 0));
  const stageCount = input.stages.length;
  const clampedIndex = Math.min(input.stageIndex, Math.max(0, stageCount - 1));
  const stages: BatchBoardStage[] = input.stages.map((stage, index) => ({
    id: stage.id,
    label: stage.label,
    revealed: index <= clampedIndex && input.phase !== "loading",
    current: index === clampedIndex && input.phase !== "done",
  }));
  const currentStageLabel = input.stages[clampedIndex]?.label ?? "";
  const spotlight =
    survivors.find((cat) => cat.spotlight && cat.previewUrl) ?? null;

  return {
    title: input.title ?? "Adoption Elimination",
    phase: input.phase,
    statusLabel: batchStatusLabel(input.phase, input.saved, currentStageLabel),
    saved: input.saved,
    stageIndex: input.stageIndex,
    stages,
    remaining: input.cats.length - input.eliminatedIds.length,
    finalCount: input.finalCount,
    poolCount: input.cats.length,
    cats,
    survivors,
    eliminated,
    spotlight,
    qrUrl: input.qrUrl,
  };
}
