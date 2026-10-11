import type { BatchBoardModel } from "./batchModel";
import type { LineageReveal } from "./ceremony";
import type { LineageModel } from "./lineageModel";

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
