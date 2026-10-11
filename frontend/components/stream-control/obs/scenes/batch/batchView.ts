import type { BatchStage } from "@/lib/adoption/streamBatch";
import type { CatParams } from "@/lib/cat-v3/types";
import type { BatchThemeId } from "../../themes/batchThemeMeta";
import type { LookChrome } from "../shared/plaqueModel";
import type { BatchBeat, BatchBeatKind } from "./batchBeats";

/** Where the elimination show is right now (legacy phase word; `beat` is finer). */
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
  /** Alias of `departing` kept for the existing looks. */
  fading: boolean;
  /** Culled just now — leaving during the depart beat (1600 ms). */
  departing: boolean;
  /** This stage changed the cat's pixels. */
  changed: boolean;
  /** The cat's new-stage frame has been published to previewUrl (deal order). */
  landed: boolean;
  /** This stage's value for the cat, null when unchanged ("Little", "Tuxedo"). */
  valueLabel: string | null;
}

/** Everything a batch look renders from. Produced by `useBatchShow`. */
export interface BatchShowView {
  title: string;
  phase: BatchScenePhase;
  beat: BatchBeat;
  stages: readonly BatchStage[];
  /** Index of the stage being revealed (clamped to the plan). */
  stageIndex: number;
  /** 1-based, clamped — for "stage 7 of 15". */
  stageNumber: number;
  stageLabel: string;
  /** Current stage name, kept during awaiting/verdict/depart ("White Patches"). */
  traitLabel: string;
  /** All cats in pool order, culled ones included. */
  cats: readonly BatchViewCat[];
  /** Not culled, plus the one currently departing. */
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
  reducedMotion: boolean;
}

export interface BatchSceneViewProps {
  view: BatchShowView;
}

export function batchStatusLabel(
  beat: BatchBeatKind,
  saved: boolean,
  stageLabel: string,
  pendingNumber: string | null,
): string {
  switch (beat) {
    case "loading":
      return "Summoning…";
    case "windup":
    case "deal":
      return `Rolling ${stageLabel}…`;
    case "hold":
      return `${stageLabel} rolled`;
    case "awaiting":
      return `${stageLabel} rolled. Who leaves? Say a number`;
    case "verdict":
      return `#${pendingNumber ?? "??"} leaves in…`;
    case "depart":
      return `#${pendingNumber ?? "??"} leaves`;
    case "repack":
      return "Making room…";
    case "done":
      return saved ? "Complete" : "Saving…";
  }
}

/** Wrapper chrome per batch look. "slot" looks MUST mount [data-plaque-slot] unconditionally. */
export const BATCH_LOOK_CHROME: Readonly<Record<BatchThemeId, LookChrome>> = {
  simple: { plaque: "slot", lines: true, glints: true },
  gathering: { plaque: "slot", lines: true, glints: true },
  album: { plaque: "slot", lines: true, glints: true },
  catshow: { plaque: "slot", lines: true, glints: true },
  claw: { plaque: "slot", lines: true, glints: true },
  nursery: { plaque: "slot", lines: true, glints: true },
  allegiances: { plaque: "slot", lines: true, glints: true },
  // 4-tone LCD: own treatment in material.
  handheld: { plaque: "none", lines: false, glints: false },
  trench: { plaque: "slot", lines: true, glints: true },
  // Photographic paper, no sparkle.
  contact: { plaque: "slot", lines: true, glints: false },
};
