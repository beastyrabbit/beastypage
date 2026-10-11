"use client";

import type { ComponentType } from "react";
import { AllegiancesBatch } from "../../looks/allegiances/AllegiancesBatch";
import { batchBoardFromView } from "../../looks/batchFromView";
import { ContactBatch } from "../../looks/contact/ContactBatch";
import { HandheldBatch } from "../../looks/handheld/HandheldBatch";
import type { BatchBoardProps } from "../../looks/LookBoardProps";
import { TrenchBatch } from "../../looks/strata/TrenchBatch";
import type { BatchThemeId } from "../../themes/batchThemeMeta";
import { AlbumBatchScene } from "./AlbumBatchScene";
import type { BatchSceneViewProps } from "./batchView";
import { CatShowBatchScene } from "./CatShowBatchScene";
import { ClawBatchScene } from "./ClawBatchScene";
import { GatheringBatchScene } from "./GatheringBatchScene";
import { NurseryBatchScene } from "./NurseryBatchScene";
import { SimpleBatchScene } from "./SimpleBatchScene";

/** Boards from the looks folder read a `BatchBoardModel`; bridge the view. */
function fromBoard(
  Board: ComponentType<BatchBoardProps>,
): ComponentType<BatchSceneViewProps> {
  return function BatchBoardScene({ view }: BatchSceneViewProps) {
    return <Board model={batchBoardFromView(view)} />;
  };
}

/** One look component per batch theme id. All read the same `BatchShowView`. */
export const BATCH_SCENES: Record<
  BatchThemeId,
  ComponentType<BatchSceneViewProps>
> = {
  simple: SimpleBatchScene,
  gathering: GatheringBatchScene,
  album: AlbumBatchScene,
  catshow: CatShowBatchScene,
  claw: ClawBatchScene,
  nursery: NurseryBatchScene,
  allegiances: fromBoard(AllegiancesBatch),
  handheld: fromBoard(HandheldBatch),
  trench: fromBoard(TrenchBatch),
  contact: fromBoard(ContactBatch),
};
