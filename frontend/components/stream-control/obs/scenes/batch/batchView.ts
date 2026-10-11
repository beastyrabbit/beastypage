import type { BatchStage } from "@/lib/adoption/streamBatch";
import type { CatParams } from "@/lib/cat-v3/types";

/** Where the elimination show is right now. */
export type BatchScenePhase = "loading" | "revealing" | "awaitingCull" | "done";

/** One cat as a look needs to draw it. */
export interface BatchViewCat {
  id: string;
  /** Fixed 1-based pool position — what chat says ("number 13"). */
  number: number;
  /** Two-digit `number` ("07"). */
  numberLabel: string;
  /** The command's label ("Cat 7"). */
  label: string;
  /** Rendered sprite at the current reveal stage, null until the first render lands. */
  previewUrl: string | null;
  /** Params at the stage `previewUrl` shows (unrevealed traits are the bare-kit
   * placeholders) — looks that describe the cat in prose read these, so the
   * prose never runs ahead of the reveal. Full params only once every stage
   * is revealed. */
  params: CatParams;
  /** Streamer's removal candidate — only meaningful while awaiting a cull. */
  marked: boolean;
  /** "Maybe leaves next" (resets each cull). */
  potential: boolean;
  /** Crowd favourite (persists). */
  favorite: boolean;
  /** Shown big by the look's spotlight slot. */
  spotlight: boolean;
  /** Culled. Still listed in `cats` so fixed-position looks keep the slot. */
  eliminated: boolean;
  /** Culled just now — the look plays its leave animation on this cat. */
  fading: boolean;
}

/** Everything a batch look renders from. Produced by `useBatchShow`. */
export interface BatchShowView {
  title: string;
  phase: BatchScenePhase;
  stages: readonly BatchStage[];
  /** Index of the stage being revealed (clamped to the plan). */
  stageIndex: number;
  /** 1-based, clamped — for "stage 7 of 15". */
  stageNumber: number;
  stageLabel: string;
  /** All cats in pool order, culled ones included. */
  cats: readonly BatchViewCat[];
  /** Not culled, plus the one currently fading out. */
  survivors: readonly BatchViewCat[];
  /** Culled cats in elimination order. */
  eliminated: readonly BatchViewCat[];
  poolSize: number;
  remaining: number;
  finalCount: number;
  /** How many culls the show needs in total. */
  maxEliminations: number;
  /** 1-based number of the next cull (`eliminated.length + 1`). */
  cullNumber: number;
  spotlight: BatchViewCat | null;
  /** Adoption page QR target once the litter is saved; null before. */
  qrUrl: string | null;
  /** Short status for the look's header. */
  statusLabel: string;
}

export interface BatchSceneViewProps {
  view: BatchShowView;
}

export function batchStatusLabel(
  phase: BatchScenePhase,
  saved: boolean,
  stageLabel: string,
): string {
  if (phase === "loading") return "Summoning…";
  if (phase === "done") return saved ? "Complete" : "Saving…";
  if (phase === "awaitingCull") return "Choosing who leaves…";
  return `Rolling ${stageLabel}…`;
}
