"use client";

import type { ComponentType } from "react";
import { SpinBoard } from "../scenes/SpinBoard";
import type { SpinSceneProps } from "./SpinSceneProps";
import { MixtapeSpinScene } from "./scenes/MixtapeSpinScene";
import { PlateSpinScene } from "./scenes/PlateSpinScene";
import { SamplerSpinScene } from "./scenes/SamplerSpinScene";
import { StarchartSpinScene } from "./scenes/StarchartSpinScene";
import { TransitSpinScene } from "./scenes/TransitSpinScene";
import {
  OVERLAY_THEME_META,
  type OverlayThemeId,
  type OverlayThemeMeta,
} from "./themeMeta";

export interface OverlayThemeDefinition extends OverlayThemeMeta {
  SpinScene: ComponentType<SpinSceneProps>;
}

const SCENES: Record<OverlayThemeId, ComponentType<SpinSceneProps>> = {
  classic: SpinBoard,
  plate: PlateSpinScene,
  sampler: SamplerSpinScene,
  starchart: StarchartSpinScene,
  transit: TransitSpinScene,
  mixtape: MixtapeSpinScene,
};

export const OVERLAY_THEMES: Record<OverlayThemeId, OverlayThemeDefinition> =
  Object.fromEntries(
    (Object.keys(OVERLAY_THEME_META) as OverlayThemeId[]).map((id) => [
      id,
      { ...OVERLAY_THEME_META[id], SpinScene: SCENES[id] },
    ]),
  ) as Record<OverlayThemeId, OverlayThemeDefinition>;

export function getOverlayTheme(id: OverlayThemeId): OverlayThemeDefinition {
  return OVERLAY_THEMES[id];
}
