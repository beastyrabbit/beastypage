"use client";

import type { ComponentType } from "react";
import type { BatchThemeId } from "../../themes/batchThemeMeta";
import { AlbumBatchScene } from "./AlbumBatchScene";
import type { BatchSceneViewProps } from "./batchView";
import { CatShowBatchScene } from "./CatShowBatchScene";
import { ClawBatchScene } from "./ClawBatchScene";
import { GatheringBatchScene } from "./GatheringBatchScene";
import { NurseryBatchScene } from "./NurseryBatchScene";
import { SimpleBatchScene } from "./SimpleBatchScene";

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
};
