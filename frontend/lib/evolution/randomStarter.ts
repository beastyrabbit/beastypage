/**
 * Builds a clean random starter kit for an evolution batch: no accessories,
 * scars, or tortie layers, with the chosen hair sprite applied. Shared by
 * the evolution generator page and the stream control panel.
 */

import type { CatParams } from "@/lib/cat-v3/types";
import {
  applyEvolutionStarterHairToParams,
  type EvolutionStarterHair,
  resolveEvolutionStarterHair,
} from "./evolutionGenerator";

export function cleanRandomStarterLayers(params: CatParams): CatParams {
  const next = { ...params };
  next.accessories = [];
  next.scars = [];
  next.tortie = [];
  next.isTortie = false;
  delete next.accessory;
  delete next.scar;
  delete next.tortieMask;
  delete next.tortiePattern;
  delete next.tortieColour;
  return next;
}

export async function buildRandomEvolutionStarter(
  hairSprite: EvolutionStarterHair,
) {
  const { generateRandomParamsV3Detailed } = await import(
    "@/lib/cat-v3/randomGenerator"
  );
  const randomStarter = await generateRandomParamsV3Detailed({
    exactLayerCounts: true,
    slotOverrides: {
      accessories: 0,
      scars: 0,
      tortie: 0,
    },
  });
  const starterHair = resolveEvolutionStarterHair(hairSprite);
  return {
    params: applyEvolutionStarterHairToParams(
      cleanRandomStarterLayers(randomStarter.params),
      starterHair,
    ),
    accessorySlots: [],
    scarSlots: [],
    tortieSlots: [],
    counts: { accessories: 0, scars: 0, tortie: 0 },
  };
}
