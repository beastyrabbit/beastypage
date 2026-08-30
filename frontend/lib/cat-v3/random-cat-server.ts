import {
  getCatalogElements,
  getPublicCatTrait,
} from "@/lib/cat-system/catalog";
import { catDocumentToLegacyParams } from "@/lib/cat-system/document";
import {
  createGachaCatalogs,
  type GachaSeed,
  type GachaSlotOverrides,
  type GachaSlotRanges,
  rollCatFromRegistry,
} from "@/lib/cat-system/gacha";
import type { CatTraitId } from "@/lib/cat-system/registry";
import type { CatDocument } from "@/lib/cat-system/runtime";
import { getCatTraitDefinition } from "@/lib/cat-system/runtime";
import { getColorNamesForPalette, type PaletteId } from "@/lib/palettes";
import peltInfo from "@/public/sprite-data/peltInfo.json";
import { poseNameForLegacySpriteNumber } from "./poseOptions";
import type { RandomGenerationOptions } from "./randomGenerator";
import type { CatParams, SlotSelections } from "./types";

const WHITE_TINTS = ["darkcream", "cream", "offwhite", "gray", "pink"] as const;
const DISCORD_OVERRIDE_VALUE_MAX_LENGTH = 100;
const TORTIE_LAYER_KEYS = ["mask", "pattern", "colour"] as const;

export interface DiscordCatOverrides {
  sprite?: number;
  poseName?: string;
  pelt?: string;
  colour?: string;
  eyeColour?: string;
  shading?: boolean;
  accessories?: number;
  scars?: number;
  torties?: number;
  accessoriesMin?: number;
  accessoriesMax?: number;
  scarsMin?: number;
  scarsMax?: number;
  tortiesMin?: number;
  tortiesMax?: number;
  darkForest?: boolean;
  starclan?: boolean;
  palettes?: string[];
  traitOverrides?: Readonly<Record<string, unknown>>;
}

export interface DiscordTraitOverride {
  traitId: CatTraitId;
  value: unknown;
}

function parseDiscordObjectListOverride(
  definition: NonNullable<ReturnType<typeof getCatTraitDefinition>>,
  rawValue: string,
): unknown[] | null {
  if (definition.gacha.strategy !== "tortieList") return null;

  let item: unknown;
  try {
    item = JSON.parse(rawValue);
  } catch {
    return null;
  }
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;

  const record = item as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (
    keys.length !== TORTIE_LAYER_KEYS.length ||
    !TORTIE_LAYER_KEYS.every((key) => keys.includes(key))
  ) {
    return null;
  }

  const catalogByProperty = {
    mask: definition.gacha.maskCatalog,
    pattern: definition.gacha.peltCatalog,
    colour: definition.gacha.colourCatalog,
  } as const;
  for (const key of TORTIE_LAYER_KEYS) {
    const value = record[key];
    if (
      typeof value !== "string" ||
      !getCatalogElements(catalogByProperty[key]).some(
        (entry) => entry.id === value,
      )
    ) {
      return null;
    }
  }

  const parsed = definition.value.schema.safeParse([record]);
  return parsed.success && Array.isArray(parsed.data) ? parsed.data : null;
}

/** Parses the generic Discord trait/value pair against the compiled registry. */
export function parseDiscordTraitOverride(
  rawTraitId: string,
  rawValue: string,
): DiscordTraitOverride | null {
  if (rawValue.length > DISCORD_OVERRIDE_VALUE_MAX_LENGTH) return null;
  const definition = getCatTraitDefinition(rawTraitId);
  if (!definition) return null;

  let value: unknown;
  switch (definition.value.kind) {
    case "string":
      value = rawValue;
      break;
    case "boolean": {
      const normalized = rawValue.trim().toLowerCase();
      if (normalized !== "true" && normalized !== "false") return null;
      value = normalized === "true";
      break;
    }
    case "integer": {
      const parsed = Number(rawValue);
      if (!Number.isInteger(parsed)) return null;
      value = parsed;
      break;
    }
    case "stringList":
      value = [rawValue];
      break;
    case "objectList":
      value = parseDiscordObjectListOverride(definition, rawValue);
      if (value === null) return null;
      break;
  }

  const publicTrait = getPublicCatTrait(definition.id);
  const catalogId = publicTrait?.gacha?.catalog ?? publicTrait?.value.catalog;
  if (
    catalogId &&
    !getCatalogElements(catalogId).some((entry) => entry.id === rawValue)
  ) {
    return null;
  }
  const parsed = definition.value.schema.safeParse(value);
  if (!parsed.success) return null;
  return {
    traitId: definition.id as CatTraitId,
    value: parsed.data,
  };
}

export interface SeededServerRandomResult {
  params: CatParams;
  document: CatDocument;
  slotSelections: SlotSelections;
  seed: GachaSeed;
  rngVersion: "xoshiro128**-v1";
}

function colourPools(overrides: DiscordCatOverrides): string[][] {
  const pools = Array.from(
    new Set(
      (overrides.palettes ?? [])
        .map((palette) => palette.trim().toLowerCase())
        .filter(Boolean),
    ),
    (palette) => getColorNamesForPalette(palette as PaletteId),
  ).filter((pool) => pool.length > 0);
  return pools.length > 0 ? pools : [peltInfo.colors];
}

function bundledCatalogs(overrides: DiscordCatOverrides) {
  return createGachaCatalogs({
    colours: colourPools(overrides),
    whitePatchColours: WHITE_TINTS,
    tortieWhitePatchColours: WHITE_TINTS,
    // Discord palettes historically affected coats, never white-patch tints.
    paletteColours: [],
  });
}

function fixedTraits(
  overrides: DiscordCatOverrides,
): Partial<Record<CatTraitId, unknown>> {
  const result: Partial<Record<CatTraitId, unknown>> = {};
  const poseName =
    overrides.poseName ?? poseNameForLegacySpriteNumber(overrides.sprite);
  if (poseName) result.pose = poseName;
  if (overrides.pelt) result.pelt = overrides.pelt;
  if (overrides.colour) result.colour = overrides.colour;
  if (overrides.eyeColour) result.eyeColour = overrides.eyeColour;
  if (overrides.shading !== undefined) result.shading = overrides.shading;
  if (overrides.darkForest !== undefined) {
    result.darkForest = overrides.darkForest;
  }
  if (overrides.starclan !== undefined) result.dead = overrides.starclan;
  for (const [rawTraitId, value] of Object.entries(
    overrides.traitOverrides ?? {},
  )) {
    const definition = getCatTraitDefinition(rawTraitId);
    if (definition?.value.schema.safeParse(value).success) {
      result[definition.id as CatTraitId] = value;
    }
  }
  return result;
}

function slotOverrides(
  overrides: DiscordCatOverrides,
  options: RandomGenerationOptions,
): GachaSlotOverrides | undefined {
  const result: GachaSlotOverrides = { ...(options.slotOverrides ?? {}) };
  if (overrides.accessories !== undefined) {
    result.accessories = overrides.accessories;
  }
  if (overrides.scars !== undefined) result.scars = overrides.scars;
  if (overrides.torties !== undefined) result.tortie = overrides.torties;
  return Object.keys(result).length > 0 ? result : undefined;
}

function slotRanges(overrides: DiscordCatOverrides): GachaSlotRanges {
  return {
    accessories: {
      min: overrides.accessoriesMin ?? 0,
      max: overrides.accessoriesMax ?? 4,
    },
    scars: {
      min: overrides.scarsMin ?? 0,
      max: overrides.scarsMax ?? 4,
    },
    tortie: {
      min: overrides.tortiesMin ?? 0,
      max: overrides.tortiesMax ?? 4,
    },
  };
}

function dualParams(document: CatDocument): CatParams {
  const legacy = catDocumentToLegacyParams(document);
  for (const key of ["accessories", "scars", "tortie"] as const) {
    if (Array.isArray(legacy[key]) && legacy[key].length === 0) {
      delete legacy[key];
    }
  }
  for (const key of ["lighting", "dead"] as const) {
    if (legacy[key] === false) delete legacy[key];
  }
  return {
    ...legacy,
    spriteNumber:
      typeof legacy.spriteNumber === "number" ? legacy.spriteNumber : 0,
    schemaVersion: document.schemaVersion,
    traits: document.traits,
    unknownTraits: document.unknownTraits,
  } as unknown as CatParams;
}

export async function generateRandomParamsServerDetailed(
  overrides: DiscordCatOverrides = {},
  options: RandomGenerationOptions = {},
): Promise<SeededServerRandomResult> {
  const result = rollCatFromRegistry(bundledCatalogs(overrides), {
    seed: options.seed,
    exactLayerCounts: options.exactLayerCounts,
    countsMode: options.countsMode,
    slotOverrides: slotOverrides(overrides, options),
    slotRanges: slotRanges(overrides),
    fixedTraits: fixedTraits(overrides),
    traitProbabilities:
      overrides.darkForest === undefined ? { darkForest: 0.1 } : undefined,
  });

  return {
    params: dualParams(result.document),
    document: result.document,
    slotSelections: result.slotSelections as unknown as SlotSelections,
    seed: result.seed,
    rngVersion: result.rngVersion,
  };
}

export async function generateRandomParamsServer(
  overrides: DiscordCatOverrides = {},
  options: RandomGenerationOptions = {},
): Promise<CatParams> {
  return (await generateRandomParamsServerDetailed(overrides, options)).params;
}
