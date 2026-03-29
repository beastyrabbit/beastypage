import type { SingleCatSettings } from "@/utils/singleCatVariants";
import type { SingleCatPortableSettings } from "./types";

/**
 * Extract only the portable (non-timing) fields from a full settings
 * object.  The result can be encoded into a 6-word code.
 */
export function extractPortableSettings(
  full: SingleCatSettings,
): SingleCatPortableSettings {
  return {
    accessoryRange: { ...full.accessoryRange },
    scarRange: { ...full.scarRange },
    tortieRange: { ...full.tortieRange },
    exactLayerCounts: full.exactLayerCounts,
    afterlifeMode: full.afterlifeMode,
    includeBaseColours: full.includeBaseColours,
    extendedModes: [...full.extendedModes],
  };
}

/**
 * Merge portable settings into a full settings object, preserving all
 * non-portable fields (timing, mode, speed multiplier, names, etc.).
 */
export function applyPortableSettings(
  full: SingleCatSettings,
  portable: SingleCatPortableSettings,
): SingleCatSettings {
  return {
    ...full,
    accessoryRange: { ...portable.accessoryRange },
    scarRange: { ...portable.scarRange },
    tortieRange: { ...portable.tortieRange },
    exactLayerCounts: portable.exactLayerCounts,
    afterlifeMode: portable.afterlifeMode,
    includeBaseColours: portable.includeBaseColours,
    extendedModes: [...portable.extendedModes],
  };
}
