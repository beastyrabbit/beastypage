import { deduplicateTortieLayers } from "@/lib/cat-system/tortieLayers";
import type { CatParams, TortieLayer } from "@/lib/cat-v3/types";

export function hasDuplicateTortieLayers(
  layers: readonly TortieLayer[],
): boolean {
  return deduplicateTortieLayers(layers).length !== layers.length;
}

export const DUPLICATE_TORTIE_MESSAGE =
  "Another tortie layer already uses this pattern, colour and mask. Your previous selection has been kept.";

export const MAX_BUILDER_TORTIE_LAYERS = 6;

export interface TortieLayerOptions {
  pelts: readonly string[];
  colours: readonly string[];
  masks: readonly string[];
}

/** Creates a new layer without changing any existing layer. */
export function createTortieLayer(
  layers: readonly TortieLayer[],
  base: CatParams,
  { pelts, colours, masks }: TortieLayerOptions,
): TortieLayer | null {
  if (layers.length >= MAX_BUILDER_TORTIE_LAYERS) return null;
  const pattern = pelts.includes("SingleColour")
    ? "SingleColour"
    : (pelts[0] ?? base.peltName ?? "SingleColour");
  const colour = colours.includes("GINGER")
    ? "GINGER"
    : (colours[0] ?? base.colour ?? "GINGER");
  const preferredMasks = ["ONE", "TWO", "THREE", "FOUR"].filter((mask) =>
    masks.includes(mask),
  );
  const availableMasks = [...new Set([...preferredMasks, ...masks])];
  const availablePatterns = [...new Set([pattern, ...pelts])];
  const availableColours = [...new Set([colour, ...colours])];
  for (const nextPattern of availablePatterns) {
    for (const nextColour of availableColours) {
      for (const mask of availableMasks) {
        const candidate = { pattern: nextPattern, colour: nextColour, mask };
        if (
          !layers.some(
            (layer) =>
              layer.pattern === candidate.pattern &&
              layer.colour === candidate.colour &&
              layer.mask === candidate.mask,
          )
        )
          return candidate;
      }
    }
  }
  return null;
}
