import type { BatchShowView } from "../scenes/batch/batchView";
import type { BatchBoardCat, BatchBoardModel } from "./batchModel";

/**
 * Bridges the batch engine's `BatchShowView` (what `useBatchShow` produces)
 * to the `BatchBoardModel` the look boards in this folder draw from. The two
 * carry the same facts; this only adds the derived bits the boards want
 * (the stage a cat left on, per-stage revealed/current flags).
 */
export function batchBoardFromView(view: BatchShowView): BatchBoardModel {
  const leftAtStage = new Map(
    view.eliminated.map((cat, index) => [cat.id, index + 1]),
  );
  const cats: BatchBoardCat[] = view.cats.map((cat) => ({
    id: cat.id,
    label: cat.label,
    previewUrl: cat.previewUrl,
    params: cat.params,
    eliminated: cat.eliminated,
    eliminatedAtStage: leftAtStage.get(cat.id) ?? null,
    fading: cat.fading,
    marked: cat.marked,
    potential: cat.potential,
    favorite: cat.favorite,
    spotlight: cat.spotlight,
  }));
  const byId = new Map(cats.map((cat) => [cat.id, cat]));
  const pick = (id: string): BatchBoardCat | null => byId.get(id) ?? null;
  const survivors = view.survivors
    .map((cat) => pick(cat.id))
    .filter((cat): cat is BatchBoardCat => cat !== null);
  const eliminated = view.eliminated
    .map((cat) => pick(cat.id))
    .filter((cat): cat is BatchBoardCat => cat !== null);
  const spotlight = view.spotlight ? pick(view.spotlight.id) : null;
  const loading = view.phase === "loading";
  const done = view.phase === "done";

  return {
    title: view.title,
    phase: view.phase,
    statusLabel: view.statusLabel,
    saved: view.qrUrl !== null,
    stageIndex: view.stageIndex,
    stages: view.stages.map((stage, index) => ({
      id: stage.id,
      label: stage.label,
      revealed: !loading && index <= view.stageIndex,
      current: !done && index === view.stageIndex,
    })),
    remaining: view.remaining,
    finalCount: view.finalCount,
    poolCount: view.poolSize,
    cats,
    survivors,
    eliminated,
    spotlight: spotlight?.previewUrl ? spotlight : null,
    qrUrl: view.qrUrl,
  };
}
