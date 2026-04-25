import type { AfterlifeOption, LayerRange } from "./singleCatVariants";

// ---------------------------------------------------------------------------
// Layer range helpers
// ---------------------------------------------------------------------------

/** Maximum value for a layer count (accessories, scars, torties). */
export const MAX_LAYER_VALUE = 4;

/** Clamp a number to the valid layer range [0, MAX_LAYER_VALUE]. */
export function clampLayerValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MAX_LAYER_VALUE, Math.round(value)));
}

/** Pick a random integer in [range.min, range.max], clamped. */
export function computeLayerCount(range: LayerRange): number {
  const min = clampLayerValue(Math.min(range.min, range.max));
  const max = clampLayerValue(Math.max(range.min, range.max));
  if (min === max) return min;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ---------------------------------------------------------------------------
// Afterlife helpers
// ---------------------------------------------------------------------------

/** Resolve an afterlife option into concrete boolean flags. */
export function resolveAfterlife(option: AfterlifeOption): {
  darkForest: boolean;
  dead: boolean;
} {
  switch (option) {
    case "off":
      return { darkForest: false, dead: false };
    case "dark10":
      return { darkForest: Math.random() < 0.1, dead: false };
    case "star10":
      return { darkForest: false, dead: Math.random() < 0.1 };
    case "both10":
      return {
        darkForest: Math.random() < 0.1,
        dead: Math.random() < 0.1,
      };
    case "darkForce":
      return { darkForest: true, dead: false };
    case "starForce":
      return { darkForest: false, dead: true };
    default:
      return { darkForest: false, dead: false };
  }
}

/** Return cat params with a single resolved afterlife outcome applied. */
export function withResolvedAfterlifeParams<T extends Record<string, unknown>>(
  params: T,
  option: AfterlifeOption,
): T & { darkForest: boolean; darkMode: boolean; dead: boolean } {
  const { darkForest, dead } = resolveAfterlife(option);
  return {
    ...params,
    darkForest,
    darkMode: darkForest,
    dead,
  };
}

/** Labeled afterlife options for dropdowns / selectors. */
export const AFTERLIFE_OPTIONS: {
  label: string;
  value: AfterlifeOption;
  description?: string;
}[] = [
  { label: "Off", value: "off" },
  { label: "Dark Forest 10%", value: "dark10" },
  { label: "StarClan 10%", value: "star10" },
  { label: "Both 10%", value: "both10" },
  { label: "Always Dark Forest", value: "darkForce" },
  { label: "Always StarClan", value: "starForce" },
];
