import type { LookChrome } from "../scenes/shared/plaqueModel";
import type { BatchBoardModel } from "./batchModel";
import type { LineageReveal } from "./ceremony";
import type { LineageModel } from "./lineageModel";
import type { ShowLookId } from "./lookMeta";

/**
 * Every look renders the evolution lineage from the same model. During the
 * ceremony `reveal` says which cats are on the board yet, which one is
 * charging (teaser frames cycling) and which one just landed; without it the
 * board draws the finished lineage.
 */
export interface LineageBoardProps {
  model: LineageModel;
  reveal?: LineageReveal;
}

/** Every look renders the batch show (all phases) from the same model. */
export interface BatchBoardProps {
  model: BatchBoardModel;
}

/** Scene canvas every board fills (the overlay root is 1920×1080). */
export const BOARD_WIDTH = 1280;
export const BOARD_HEIGHT = 1080;

/** Looks that erupt in their own material on a land; the engine confetti is suppressed for them. */
export const LOOK_ERUPTS_IN_MATERIAL: ReadonlySet<ShowLookId> =
  new Set<ShowLookId>([
    "territory",
    "strata",
    "sticker",
    // LCD whiteout and the stamp are the landing; no canvas confetti over the shell / page.
    "handheld",
    "allegiances",
  ]);

/**
 * Wrapper chrome per evolution look. "slot": the look mounts an unconditional
 * `[data-plaque-slot]` the plaque portals into; "none": the look carries the
 * roll text in its own material. glints are unused by the evolution wrapper
 * (no ambient layer); keep false.
 */
export const LOOK_CHROME: Readonly<Record<ShowLookId, LookChrome>> = {
  // The chamber HUD names the roll; the board is static.
  classic: { plaque: "none", lines: false, glints: false },
  allegiances: { plaque: "slot", lines: true, glints: false },
  // The LCD text box carries the roll.
  handheld: { plaque: "none", lines: false, glints: false },
  strata: { plaque: "slot", lines: true, glints: false },
  contact: { plaque: "slot", lines: true, glints: false },
  territory: { plaque: "slot", lines: true, glints: false },
  sticker: { plaque: "slot", lines: true, glints: false },
};
