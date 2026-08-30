/**
 * Builds a clean random starter kit for an evolution batch: no accessories,
 * scars, or tortie layers, with the chosen hair sprite applied. Shared by
 * the evolution generator page and the stream control panel.
 */

import {
  catDocumentToLegacyParams,
  readCatDocument,
} from "@/lib/cat-system/document";
import { getEvolutionTraits } from "@/lib/cat-system/runtime";
import type { CatParams } from "@/lib/cat-v3/types";
import {
  applyEvolutionStarterHairToParams,
  type EvolutionStarterHair,
  resolveEvolutionStarterHair,
} from "./evolutionGenerator";

export function cleanRandomStarterLayers(params: CatParams): CatParams {
  const document = readCatDocument(params);
  const traits = { ...document.traits } as Record<string, unknown>;
  for (const trait of getEvolutionTraits()) {
    if (
      trait.capabilities.evolution === "accumulate" &&
      (trait.value.kind === "stringList" || trait.value.kind === "objectList")
    ) {
      traits[trait.id] = [];
    }
  }
  const cleaned = readCatDocument({ ...document, traits });
  return {
    ...catDocumentToLegacyParams(cleaned),
    schemaVersion: cleaned.schemaVersion,
    traits: cleaned.traits,
    ...(cleaned.unknownTraits ? { unknownTraits: cleaned.unknownTraits } : {}),
  } as unknown as CatParams;
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
  const params = applyEvolutionStarterHairToParams(
    cleanRandomStarterLayers(randomStarter.params),
    starterHair,
  );
  return {
    document: readCatDocument(params),
    params,
    accessorySlots: [],
    scarSlots: [],
    tortieSlots: [],
    counts: { accessories: 0, scars: 0, tortie: 0 },
  };
}
