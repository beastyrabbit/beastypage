import type {
  AfterlifeOption,
  ExtendedMode,
  LayerRange,
} from "@/utils/singleCatVariants";

/**
 * Portable subset of SingleCatSettings — only the non-timing fields.
 *
 * This is the payload that gets encoded into/decoded from the 6-word
 * settings code.  Timing, mode, speed multiplier, and metadata are
 * intentionally excluded so that codes stay short and stable.
 */
export interface SingleCatPortableSettings {
  accessoryRange: LayerRange;
  scarRange: LayerRange;
  tortieRange: LayerRange;
  exactLayerCounts: boolean;
  afterlifeMode: AfterlifeOption;
  includeBaseColours: boolean;
  extendedModes: ExtendedMode[];
}
