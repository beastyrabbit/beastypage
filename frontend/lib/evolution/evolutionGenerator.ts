import type {
  AnyCatTraitDefinition,
  CatSystemDefinition,
  JsonValue,
} from "@/lib/cat-system/definition";
import {
  catDocumentToLegacyParams,
  legacyParamsToCatDocument,
  readCatDocument,
} from "@/lib/cat-system/document";
import { createGachaCatalogs } from "@/lib/cat-system/gacha/catalogs";
import {
  materializeSlots,
  resolveCount,
  roll,
} from "@/lib/cat-system/gacha/strategies";
import type { GachaCatalog, GachaCatalogs } from "@/lib/cat-system/gacha/types";
import { catSystem } from "@/lib/cat-system/registry";
import {
  type CatDocument,
  createSystemCatDocumentSchema,
} from "@/lib/cat-system/runtime";
import { isCoatPatternId, resolveCoatChoice } from "@/lib/cat-v3/coatPatterns";
import type { CatParams, TortieLayer } from "@/lib/cat-v3/types";
import {
  applyEvolutionTraitChanges,
  type EvolutionTraitChange,
} from "./traitEvolution";

export const EVOLUTION_SOURCE = "evolution-generator";
export const EVOLUTION_POLICY = "type-archetype-v1";

export type EvolutionLevel = 1 | 2 | 3;
export type EvolutionArchetype =
  | "flare"
  | "aqua"
  | "volt"
  | "leaf"
  | "moon"
  | "crystal"
  | "rose"
  | "steel"
  | "void"
  | "sun";

export type EvolutionRange = {
  min: number;
  max: number;
};

export type EvolutionControls = {
  branchCount: number;
  targetLevel: EvolutionLevel;
  torties: EvolutionRange;
  accessories: EvolutionRange;
  scars: EvolutionRange;
  scarsEnabled: boolean;
};

export type EvolutionPools = {
  tortieMasks: string[];
  tortiePatterns: string[];
  baseColours: string[];
  experimentalColours: string[];
  accessories: string[];
  plantAccessories?: string[];
  wildAccessories?: string[];
  collarAccessories?: string[];
  extraAccessories?: string[];
  scars: string[];
  colourDefinitions?: Record<string, [number, number, number]>;
  /**
   * Colour names each clan may roll. Controlled clans draw experimental
   * colours only from their set (natural base colours stay in play); wild
   * clans may additionally open up to the full experimental pool.
   */
  clanColours?: Partial<Record<EvolutionArchetype, string[]>>;
};

export type EvolutionTortiePart = {
  kind: "mask" | "pattern" | "colour";
  label: "Mask" | "Pelt" | "Colour";
  value: string;
};

export type EvolutionCatData = {
  /** Canonical state used by evolution and the renderer. */
  document: CatDocument;
  /** Legacy projection retained for existing pages and saved payloads. */
  params: CatParams;
  accessorySlots: string[];
  scarSlots: string[];
  tortieSlots: (TortieLayer | null)[];
  counts: {
    accessories: number;
    scars: number;
    tortie: number;
  };
  evolution: EvolutionCatMeta;
};

export type EvolutionReplacementSlot = "tortie" | "accessory" | "scar";

export type EvolutionAddition =
  | {
      kind: "tortie";
      traitId: "tortie";
      label: string;
      value: TortieLayer;
      traitValue: TortieLayer;
      parts: EvolutionTortiePart[];
    }
  | {
      kind: "accessory" | "scar";
      traitId: "accessories" | "scars";
      label: string;
      value: string;
      traitValue: string;
    }
  | {
      kind: "coat";
      traitId: "pose";
      label: string;
      value: string;
      traitValue: string;
    }
  | {
      kind: "replacement";
      traitId: "tortie" | "accessories" | "scars";
      slot: EvolutionReplacementSlot;
      label: string;
      previous: string;
      value: string;
      previousValue: unknown;
      traitValue: unknown;
    }
  | {
      kind: "trait";
      traitId: string;
      label: string;
      value: JsonValue;
      traitValue: JsonValue;
      previous?: JsonValue;
      previousValue?: JsonValue;
    };

export type EvolutionRoll =
  | {
      kind: "tortie-count";
      label: "Tortie layers";
      value: number;
      range: EvolutionRange;
    }
  | {
      kind: "tortie-part";
      label: string;
      layerIndex: number;
      part: EvolutionTortiePart["kind"];
      value: string;
    }
  | {
      kind: "accessory" | "scar";
      label: "Accessory" | "Scar";
      value: string;
    }
  | {
      kind: "coat";
      label: "Coat";
      value: string;
    }
  | {
      kind: "replacement";
      label: "Replacement";
      slot: EvolutionReplacementSlot;
      value: string;
    }
  | {
      kind: "trait";
      traitId: string;
      label: string;
      value: JsonValue;
    };

export type EvolutionCatMeta = {
  source: typeof EVOLUTION_SOURCE;
  policy: typeof EVOLUTION_POLICY;
  role: "starter" | "branch";
  branchIndex: number | null;
  branchLabel: string | null;
  level: 0 | EvolutionLevel;
  archetype: EvolutionArchetype | null;
  additions: EvolutionAddition[];
  rolls: EvolutionRoll[];
};

export type EvolutionGeneratedCat = {
  key: string;
  label: string;
  branchIndex: number | null;
  branchLabel: string | null;
  level: 0 | EvolutionLevel;
  archetype: EvolutionArchetype | null;
  additions: EvolutionAddition[];
  rolls: EvolutionRoll[];
  catData: EvolutionCatData;
};

export type EvolutionBatchResult = {
  starter: EvolutionGeneratedCat;
  cats: EvolutionGeneratedCat[];
  branchArchetypes: EvolutionArchetype[];
  controls: EvolutionControls;
};

export type EvolutionStarterSource =
  | { type: "random" }
  | {
      type: "history";
      slug: string;
      profileId?: string | null;
      catName?: string | null;
      creatorName?: string | null;
    };

export type EvolutionBatchSettings = {
  source: typeof EVOLUTION_SOURCE;
  evolutionPolicy: typeof EVOLUTION_POLICY;
  branchCount: number;
  targetLevel: EvolutionLevel;
  totalCats: number;
  generatedAt: number;
  starter: EvolutionStarterSource & {
    colour?: string;
    peltName?: string;
    coatPattern?: string;
  };
  layerRanges: {
    torties: EvolutionRange;
    accessories: EvolutionRange;
    scars: EvolutionRange;
    scarsEnabled: boolean;
  };
  branchArchetypes: EvolutionArchetype[];
};

type RandomFn = () => number;

export type EvolutionBatchOptions = {
  random?: RandomFn;
  archetypes?: EvolutionArchetype[];
  /** Test seam and future registry extension point. */
  system?: CatSystemDefinition;
  /** Runtime catalogs compiled from the same registry/public catalog. */
  catalogs?: GachaCatalogs;
};

const DEFAULT_CONTROLS: EvolutionControls = {
  branchCount: 6,
  targetLevel: 3,
  torties: { min: 1, max: 2 },
  accessories: { min: 1, max: 2 },
  scars: { min: 0, max: 2 },
  scarsEnabled: true,
};

const ARCHETYPE_RING: EvolutionArchetype[] = [
  "flare",
  "aqua",
  "volt",
  "leaf",
  "moon",
  "crystal",
  "rose",
  "steel",
  "void",
  "sun",
];

/**
 * Hue-coherent clans whose experimental colours come only from their
 * assigned palettes (the natural base colours always remain in play).
 */
export const CONTROLLED_ARCHETYPES: EvolutionArchetype[] = [
  "flare",
  "aqua",
  "leaf",
  "sun",
  "rose",
  "moon",
];

/** Eclectic clans that may also roll from the entire colour pool. */
export const WILD_ARCHETYPES: EvolutionArchetype[] = [
  "volt",
  "crystal",
  "void",
  "steel",
];

const WILD_ARCHETYPE_SET = new Set<EvolutionArchetype>(WILD_ARCHETYPES);
const ARCHETYPE_SET = new Set<string>([
  ...CONTROLLED_ARCHETYPES,
  ...WILD_ARCHETYPES,
]);

export function isWildArchetype(archetype: EvolutionArchetype): boolean {
  return WILD_ARCHETYPE_SET.has(archetype);
}

export function isEvolutionArchetype(
  value: unknown,
): value is EvolutionArchetype {
  return typeof value === "string" && ARCHETYPE_SET.has(value);
}

export const MAX_BRANCH_COUNT = 12;

/** Chance that a wild clan ignores its palettes and rolls the full pool. */
const WILD_OPEN_CHANCE = 0.5;

/** Warrior rank per level — also the source for UI rank display. */
export const STAGE_RANK_LABELS = [
  "Kit",
  "Apprentice",
  "Warrior",
  "Leader",
] as const;

const BASE_COLOUR_RGB: Record<string, [number, number, number]> = {
  WHITE: [238, 238, 232],
  PALEGREY: [190, 196, 198],
  SILVER: [164, 170, 174],
  GREY: [104, 112, 118],
  DARKGREY: [58, 63, 68],
  GHOST: [215, 218, 220],
  BLACK: [20, 18, 18],
  CREAM: [236, 208, 148],
  PALEGINGER: [226, 172, 92],
  GOLDEN: [214, 158, 52],
  GINGER: [194, 94, 34],
  DARKGINGER: [132, 62, 28],
  SIENNA: [118, 66, 42],
  LIGHTBROWN: [166, 116, 72],
  LILAC: [160, 135, 158],
  BROWN: [104, 66, 42],
  "GOLDEN-BROWN": [142, 92, 42],
  DARKBROWN: [72, 44, 28],
  CHOCOLATE: [58, 35, 24],
};

const ARCHETYPE_CONFIG: Record<
  EvolutionArchetype,
  {
    anchor: [number, number, number];
    experimental: string[];
    base: string[];
  }
> = {
  flare: {
    anchor: [225, 70, 40],
    experimental: [
      "CF_FIREBRAND",
      "CF_SCARLET",
      "SCARLET",
      "SUNSETORANGE",
      "EM_BLAZEORANGE",
    ],
    base: ["DARKGINGER", "GINGER", "SIENNA"],
  },
  aqua: {
    anchor: [70, 200, 210],
    experimental: ["AQUA", "TURQUOISE", "AW_CRYSTALLINE", "TL_AQUACLEAR"],
    base: ["SILVER", "PALEGREY", "GHOST"],
  },
  volt: {
    anchor: [170, 230, 65],
    experimental: ["CHARTREUSE", "NEONGREEN", "EG_VOLTGREEN", "EG_LIMELIGHT"],
    base: ["GOLDEN", "CREAM", "PALEGINGER"],
  },
  leaf: {
    anchor: [55, 160, 80],
    experimental: ["EMERALD", "SPRINGGREEN", "EF_EMERALD", "EF_LEAFLIGHT"],
    base: ["LIGHTBROWN", "BROWN", "GOLDEN-BROWN"],
  },
  moon: {
    anchor: [220, 224, 226],
    experimental: ["SS_SILVERSCREEN", "CS_POLISHED", "ZIRCON", "MIST"],
    base: ["WHITE", "SILVER", "PALEGREY", "GHOST"],
  },
  crystal: {
    anchor: [150, 195, 230],
    experimental: [
      "RA_CRYSTALPURPLE",
      "AW_CLEARICE",
      "PASTELBLUE",
      "OD_HORIZON",
    ],
    base: ["LILAC", "SILVER", "PALEGREY"],
  },
  rose: {
    anchor: [225, 90, 160],
    experimental: ["RG_GARDENROSE", "NEONPINK", "HOTPINK", "PASTELPINK"],
    base: ["LILAC", "CREAM", "PALEGINGER"],
  },
  steel: {
    anchor: [90, 100, 118],
    experimental: ["CS_BLUESTEEL", "SC_STEELGRAY", "CS_ALLOY", "CS_TUNGSTEN"],
    base: ["GREY", "DARKGREY", "GHOST", "BLACK"],
  },
  void: {
    anchor: [28, 18, 50],
    experimental: ["MV_VOIDNAVY", "SS_FILMREEL", "CF_DARKBLOOD", "IW_SUMI"],
    base: ["BLACK", "DARKGREY", "CHOCOLATE"],
  },
  sun: {
    anchor: [230, 185, 55],
    experimental: ["GH_GOLDENSUN", "GOLDLEAF", "ZEST", "GH_SUNBEAM"],
    base: ["GOLDEN", "CREAM", "PALEGINGER"],
  },
};

const EXPERIMENTAL_CHANCE: Record<EvolutionLevel, number> = {
  1: 0.35,
  2: 0.5,
  3: 0.65,
};

/**
 * How often a colour pick favours the archetype's preferred list. Kept
 * moderate so lines stay thematic without every layer looking the same.
 */
const PREFERRED_COLOUR_BIAS = 0.5;

/**
 * Chance per evolution that one already-owned tortie/accessory/scar is
 * rerolled instead of kept. ~0.16 means roughly two replacements across a
 * default 6-line × 3-stage run (only stages that own traits are eligible).
 */
const REPLACEMENT_CHANCE = 0.16;

/** Chance per evolution that a shorthair coat grows out. One-way: 8 -> 9. */
const COAT_GROWTH_CHANCE = 0.12;
export const SHORT_HAIR_SPRITE = 8;
export const LONG_HAIR_SPRITE = 9;
export const SHORT_HAIR_POSE = "adult_short2";
export const LONG_HAIR_POSE = "adult_long0";

export type EvolutionStarterHair = "random" | "short" | "long";
export type EvolutionStarterHairStyle = {
  spriteNumber: typeof SHORT_HAIR_SPRITE | typeof LONG_HAIR_SPRITE;
  poseName: typeof SHORT_HAIR_POSE | typeof LONG_HAIR_POSE;
};

export const EVOLUTION_STARTER_HAIR_STYLES = {
  short: { spriteNumber: SHORT_HAIR_SPRITE, poseName: SHORT_HAIR_POSE },
  long: { spriteNumber: LONG_HAIR_SPRITE, poseName: LONG_HAIR_POSE },
} as const satisfies Record<
  Exclude<EvolutionStarterHair, "random">,
  EvolutionStarterHairStyle
>;

export const MAX_TORTIE_PER_STAGE = 4;
export const MAX_LAYERS_PER_STAGE = 2;

const TORTIE_COUNT_WEIGHTS: Record<number, number> = {
  0: 0.1,
  1: 0.65,
  2: 0.35,
  3: 0.16,
  4: 0.08,
};

const ACCESSORY_COUNT_WEIGHTS: Record<number, number> = {
  0: 0.1,
  1: 0.6,
  2: 0.4,
};

const SCAR_COUNT_WEIGHTS: Record<number, number> = {
  0: 0.5,
  1: 0.35,
  2: 0.15,
};

const ACCESSORY_CATEGORY_WEIGHTS: Record<
  EvolutionLevel,
  Record<"plant" | "wild" | "collar" | "extra", number>
> = {
  1: { plant: 0.45, wild: 0.12, collar: 0.35, extra: 0.08 },
  2: { plant: 0.25, wild: 0.25, collar: 0.25, extra: 0.25 },
  3: { plant: 0.12, wild: 0.35, collar: 0.15, extra: 0.38 },
};

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(numeric)));
}

function clampRange(
  value: Partial<EvolutionRange> | undefined,
  fallback: EvolutionRange,
  limit: number,
) {
  const min = clampInt(value?.min, 0, limit, fallback.min);
  const max = clampInt(value?.max, 0, limit, fallback.max);
  return min <= max ? { min, max } : { min: max, max: min };
}

export function normalizeEvolutionControls(
  value: Partial<EvolutionControls> = {},
): EvolutionControls {
  return {
    branchCount: clampInt(
      value.branchCount,
      1,
      12,
      DEFAULT_CONTROLS.branchCount,
    ),
    targetLevel: clampInt(
      value.targetLevel,
      1,
      3,
      DEFAULT_CONTROLS.targetLevel,
    ) as EvolutionLevel,
    torties: clampRange(
      value.torties,
      DEFAULT_CONTROLS.torties,
      MAX_TORTIE_PER_STAGE,
    ),
    accessories: clampRange(
      value.accessories,
      DEFAULT_CONTROLS.accessories,
      MAX_LAYERS_PER_STAGE,
    ),
    scars: clampRange(
      value.scars,
      DEFAULT_CONTROLS.scars,
      MAX_LAYERS_PER_STAGE,
    ),
    scarsEnabled: value.scarsEnabled ?? DEFAULT_CONTROLS.scarsEnabled,
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function resolveEvolutionStarterHair(
  hair: EvolutionStarterHair,
  random: RandomFn = Math.random,
): EvolutionStarterHairStyle {
  if (hair === "short") return EVOLUTION_STARTER_HAIR_STYLES.short;
  if (hair === "long") return EVOLUTION_STARTER_HAIR_STYLES.long;
  return random() < 0.5
    ? EVOLUTION_STARTER_HAIR_STYLES.short
    : EVOLUTION_STARTER_HAIR_STYLES.long;
}

export function applyEvolutionStarterHairToParams(
  params: CatParams,
  hair: EvolutionStarterHairStyle,
): CatParams {
  return {
    ...params,
    spriteNumber: hair.spriteNumber,
    poseName: hair.poseName,
    ...(params.traits
      ? { traits: { ...params.traits, pose: hair.poseName } }
      : {}),
  };
}

export function applyEvolutionStarterHairToPayload(
  input: unknown,
  hair: EvolutionStarterHairStyle,
): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const raw = clone(input as Record<string, unknown>);
  if (hasCanonicalTraits(raw.document)) {
    const document = readCatDocument(raw.document);
    const updated = readCatDocument({
      ...document,
      traits: { ...document.traits, pose: hair.poseName },
    });
    raw.document = updated;
    if (raw.params && typeof raw.params === "object") {
      raw.params = documentToEvolutionParams(updated);
    }
    return raw;
  }
  if (hasCanonicalTraits(raw)) {
    const document = readCatDocument(raw);
    return documentToEvolutionParams(
      readCatDocument({
        ...document,
        traits: { ...document.traits, pose: hair.poseName },
      }),
    );
  }
  if (
    raw.params &&
    typeof raw.params === "object" &&
    !Array.isArray(raw.params)
  ) {
    raw.params = applyEvolutionStarterHairToParams(
      raw.params as unknown as CatParams,
      hair,
    );
    return raw;
  }
  return applyEvolutionStarterHairToParams(raw as unknown as CatParams, hair);
}

function applyCanonicalStarterHair(params: CatParams): CatParams {
  const spriteNumber = Number(params.spriteNumber);
  if (spriteNumber === SHORT_HAIR_SPRITE) {
    return applyEvolutionStarterHairToParams(
      params,
      EVOLUTION_STARTER_HAIR_STYLES.short,
    );
  }
  if (spriteNumber === LONG_HAIR_SPRITE) {
    return applyEvolutionStarterHairToParams(
      params,
      EVOLUTION_STARTER_HAIR_STYLES.long,
    );
  }
  return params;
}

function cleanString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (!trimmed || trimmed.toLowerCase() === "none") return null;
  return trimmed;
}

function uniqueClean(values: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const cleaned = cleanString(value);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    result.push(cleaned);
  }
  return result;
}

function normalizeStringSlots(
  slotValues: unknown,
  paramsValues: unknown,
  primaryValue: unknown,
): string[] {
  const source = Array.isArray(slotValues)
    ? slotValues
    : Array.isArray(paramsValues)
      ? paramsValues
      : primaryValue
        ? [primaryValue]
        : [];
  return uniqueClean(source);
}

function normalizeTortieLayer(value: unknown): TortieLayer | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const mask = cleanString(record.mask);
  const pattern = cleanString(record.pattern);
  const colour = cleanString(record.colour);
  if (!mask || !pattern || !colour) return null;
  return { mask, pattern, colour };
}

function normalizeTortieSlots(data: Record<string, unknown>): TortieLayer[] {
  const rawSlots = Array.isArray(data.tortieSlots)
    ? data.tortieSlots
    : Array.isArray(data.tortie)
      ? data.tortie
      : [];
  const layers = rawSlots
    .map((value) => normalizeTortieLayer(value))
    .filter((value): value is TortieLayer => Boolean(value));

  if (layers.length > 0) return layers;

  const fallback = normalizeTortieLayer({
    mask: data.tortieMask,
    pattern: data.tortiePattern,
    colour: data.tortieColour,
  });
  return fallback ? [fallback] : [];
}

function applySlotsToParams(
  params: CatParams,
  accessories: string[],
  scars: string[],
  torties: TortieLayer[],
): CatParams {
  const next = clone(params);

  if (accessories.length > 0) {
    next.accessories = [...accessories];
    next.accessory = accessories[0];
  } else {
    delete next.accessories;
    delete next.accessory;
  }

  if (scars.length > 0) {
    next.scars = [...scars];
    next.scar = scars[0];
  } else {
    delete next.scars;
    delete next.scar;
  }

  if (torties.length > 0) {
    next.isTortie = true;
    next.tortie = torties.map((layer) => ({ ...layer }));
    next.tortieMask = torties[0]?.mask;
    next.tortiePattern = torties[0]?.pattern;
    next.tortieColour = torties[0]?.colour;
  } else {
    next.isTortie = false;
    next.tortie = [];
    delete next.tortieMask;
    delete next.tortiePattern;
    delete next.tortieColour;
  }

  return next;
}

function hasCanonicalTraits(value: unknown): value is {
  schemaVersion?: unknown;
  traits: Record<string, unknown>;
  unknownTraits?: unknown;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const traits = (value as Record<string, unknown>).traits;
  return (
    Boolean(traits) && typeof traits === "object" && !Array.isArray(traits)
  );
}

function parseEvolutionDocumentForSystem(
  input: unknown,
  system: CatSystemDefinition,
): CatDocument {
  if (system === catSystem) return readCatDocument(input);
  return createSystemCatDocumentSchema(system).parse(input) as CatDocument;
}

function readEvolutionDocument(
  raw: Record<string, unknown>,
  system: CatSystemDefinition,
): CatDocument {
  if (hasCanonicalTraits(raw.document)) {
    return parseEvolutionDocumentForSystem(raw.document, system);
  }
  if (hasCanonicalTraits(raw))
    return parseEvolutionDocumentForSystem(raw, system);
  if (hasCanonicalTraits(raw.params)) {
    return parseEvolutionDocumentForSystem(raw.params, system);
  }

  const legacySource =
    raw.params && typeof raw.params === "object" && !Array.isArray(raw.params)
      ? (raw.params as Record<string, unknown>)
      : raw;
  return legacyParamsToCatDocument(legacySource);
}

function normalizeDocumentForEvolutionSystem(
  document: CatDocument,
  normalizedParams: CatParams,
  system: CatSystemDefinition,
): CatDocument {
  const productDocument = legacyParamsToCatDocument(normalizedParams);
  if (system === catSystem) return productDocument;

  const traits: Record<string, unknown> = {
    ...(document.traits as Record<string, unknown>),
    ...(productDocument.traits as Record<string, unknown>),
  };
  const unknownTraits = {
    ...(document.unknownTraits ?? {}),
    ...(productDocument.unknownTraits ?? {}),
  };

  for (const trait of system.traits) {
    if (traits[trait.id] === undefined) {
      const candidate = unknownTraits[trait.id];
      const parsed = trait.value.schema.safeParse(candidate);
      if (parsed.success) traits[trait.id] = parsed.data;
      else if (trait.value.default !== undefined) {
        traits[trait.id] = clone(trait.value.default);
      }
    }
    delete unknownTraits[trait.id];
  }

  return createSystemCatDocumentSchema(system).parse({
    schemaVersion: system.schemaVersion,
    traits,
    unknownTraits:
      Object.keys(unknownTraits).length > 0 ? unknownTraits : undefined,
  }) as CatDocument;
}

function documentToEvolutionParams(document: CatDocument): CatParams {
  const legacy = catDocumentToLegacyParams(document);
  return {
    ...legacy,
    schemaVersion: document.schemaVersion,
    traits: clone(document.traits),
    ...(document.unknownTraits
      ? { unknownTraits: clone(document.unknownTraits) }
      : {}),
  } as unknown as CatParams;
}

function getDocumentTraitList<T>(
  document: CatDocument,
  traitId: string,
  normalize: (value: unknown) => T | null,
): T[] {
  const value = (document.traits as Record<string, unknown>)[traitId];
  if (!Array.isArray(value)) return [];
  return value.map(normalize).filter((entry): entry is T => entry !== null);
}

function projectEvolutionCatData(
  document: CatDocument,
  meta: EvolutionCatMeta,
): EvolutionCatData {
  const params = documentToEvolutionParams(document);
  const accessories = getDocumentTraitList(document, "accessories", (value) =>
    cleanString(value),
  );
  const scars = getDocumentTraitList(document, "scars", (value) =>
    cleanString(value),
  );
  const torties = getDocumentTraitList(
    document,
    "tortie",
    normalizeTortieLayer,
  );

  return {
    document: clone(document),
    params,
    accessorySlots: accessories,
    scarSlots: scars,
    tortieSlots: torties.map((layer) => ({ ...layer })),
    counts: {
      accessories: accessories.length,
      scars: scars.length,
      tortie: torties.length,
    },
    evolution: clone(meta),
  };
}

export function normalizeEvolutionStarter(
  input: unknown,
  options: { system?: CatSystemDefinition } = {},
): EvolutionCatData {
  if (!input || typeof input !== "object") {
    throw new Error("Evolution starter payload is missing");
  }

  const system = options.system ?? catSystem;
  const raw = input as Record<string, unknown>;
  const hasCanonicalDocument =
    hasCanonicalTraits(raw.document) ||
    hasCanonicalTraits(raw) ||
    hasCanonicalTraits(raw.params);
  const document = readEvolutionDocument(raw, system);
  const legacyParamsSource =
    raw.params && typeof raw.params === "object" && !Array.isArray(raw.params)
      ? (raw.params as Record<string, unknown>)
      : raw;
  const params = hasCanonicalDocument
    ? documentToEvolutionParams(document)
    : (clone(legacyParamsSource) as unknown as CatParams);
  const coatPattern = isCoatPatternId(params.coatPattern)
    ? params.coatPattern
    : isCoatPatternId(params.peltName)
      ? params.peltName
      : undefined;
  if (coatPattern) {
    Object.assign(params, resolveCoatChoice(coatPattern));
  }
  const accessories = hasCanonicalDocument
    ? getDocumentTraitList(document, "accessories", (value) =>
        cleanString(value),
      )
    : normalizeStringSlots(
        raw.accessorySlots,
        params.accessories,
        params.accessory,
      );
  const scars = hasCanonicalDocument
    ? getDocumentTraitList(document, "scars", (value) => cleanString(value))
    : normalizeStringSlots(raw.scarSlots, params.scars, params.scar);
  const torties = hasCanonicalDocument
    ? getDocumentTraitList(document, "tortie", normalizeTortieLayer)
    : normalizeTortieSlots({
        ...params,
        tortieSlots: raw.tortieSlots,
      });
  const normalizedParams = applyCanonicalStarterHair(
    applySlotsToParams(params, accessories, scars, torties),
  );
  const normalizedDocument = normalizeDocumentForEvolutionSystem(
    document,
    normalizedParams,
    system,
  );
  return projectEvolutionCatData(normalizedDocument, {
    source: EVOLUTION_SOURCE,
    policy: EVOLUTION_POLICY,
    role: "starter",
    branchIndex: null,
    branchLabel: null,
    level: 0,
    archetype: null,
    additions: [],
    rolls: [],
  });
}

function weightedPick<T extends string | number>(
  entries: Array<[T, number]>,
  random: RandomFn,
): T {
  const viable = entries.filter(([, weight]) => weight > 0);
  const total = viable.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) return viable[0]?.[0] ?? entries[0][0];

  const target = random() * total;
  let running = 0;
  for (const [value, weight] of viable) {
    running += weight;
    if (target <= running) return value;
  }
  return viable[viable.length - 1][0];
}

function pickCount(
  range: EvolutionRange,
  weights: Record<number, number>,
  random: RandomFn,
) {
  const entries: Array<[number, number]> = [];
  for (let value = range.min; value <= range.max; value += 1) {
    entries.push([value, weights[value] ?? 1]);
  }
  return weightedPick(entries, random);
}

function pickOne<T>(items: readonly T[], random: RandomFn): T | null {
  if (!items.length) return null;
  const index = Math.floor(random() * items.length);
  return items[Math.min(index, items.length - 1)] ?? null;
}

function pickUniqueString(
  pool: readonly string[],
  used: Set<string>,
  random: RandomFn,
): string | null {
  const cleanPool = uniqueClean([...pool]);
  if (!cleanPool.length) return null;
  const available = cleanPool.filter((value) => !used.has(value));
  const selected = pickOne(
    available.length > 0 ? available : cleanPool,
    random,
  );
  if (selected) used.add(selected);
  return selected;
}

function rgbDistance(a: [number, number, number], b: [number, number, number]) {
  return Math.sqrt(
    (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2,
  );
}

function getColourRgb(
  colour: string | undefined | null,
  definitions?: Record<string, [number, number, number]>,
) {
  if (!colour) return null;
  const upper = colour.toUpperCase();
  return definitions?.[upper] ?? BASE_COLOUR_RGB[upper] ?? null;
}

export function isNearStarterColour(
  starterColour: string | undefined | null,
  candidateColour: string,
  definitions?: Record<string, [number, number, number]>,
) {
  if (!starterColour) return false;
  if (starterColour.toUpperCase() === candidateColour.toUpperCase())
    return true;
  const starterRgb = getColourRgb(starterColour, definitions);
  const candidateRgb = getColourRgb(candidateColour, definitions);
  if (!starterRgb || !candidateRgb) return false;
  return rgbDistance(starterRgb, candidateRgb) < 78;
}

function inferStarterArchetype(
  starterColour: string | undefined,
  definitions?: Record<string, [number, number, number]>,
) {
  const starterRgb = getColourRgb(starterColour, definitions);
  if (!starterRgb) {
    const upper = starterColour?.toUpperCase() ?? "";
    if (upper.includes("GINGER") || upper.includes("SIENNA")) return "flare";
    if (upper.includes("GOLD") || upper.includes("CREAM")) return "sun";
    if (upper.includes("GREY") || upper.includes("SILVER")) return "steel";
    if (upper.includes("BLACK") || upper.includes("DARK")) return "void";
    if (upper.includes("BROWN")) return "leaf";
    return "sun";
  }

  return ARCHETYPE_RING.reduce(
    (best, current) => {
      const distance = rgbDistance(
        starterRgb,
        ARCHETYPE_CONFIG[current].anchor,
      );
      return distance < best.distance ? { archetype: current, distance } : best;
    },
    {
      archetype: "sun" as EvolutionArchetype,
      distance: Number.POSITIVE_INFINITY,
    },
  ).archetype;
}

function isArchetypeNearStarter(
  starterColour: string | undefined,
  archetype: EvolutionArchetype,
  definitions?: Record<string, [number, number, number]>,
) {
  const starterRgb = getColourRgb(starterColour, definitions);
  if (!starterRgb) return false;
  return rgbDistance(starterRgb, ARCHETYPE_CONFIG[archetype].anchor) < 82;
}

export function chooseBranchArchetypes(
  starterColour: string | undefined,
  branchCount: number,
  definitions?: Record<string, [number, number, number]>,
): EvolutionArchetype[] {
  const normalizedCount = clampInt(
    branchCount,
    1,
    12,
    DEFAULT_CONTROLS.branchCount,
  );
  const startArchetype = inferStarterArchetype(starterColour, definitions);
  const startIndex = ARCHETYPE_RING.indexOf(startArchetype);
  const order: EvolutionArchetype[] = [];

  for (let i = 0; i < ARCHETYPE_RING.length; i += 1) {
    const index = (startIndex + 5 + i * 3) % ARCHETYPE_RING.length;
    const archetype = ARCHETYPE_RING[index];
    if (!isArchetypeNearStarter(starterColour, archetype, definitions)) {
      order.push(archetype);
    }
  }

  const fallback = order.length > 0 ? order : [...ARCHETYPE_RING];
  const result: EvolutionArchetype[] = [];
  while (result.length < normalizedCount) {
    result.push(fallback[result.length % fallback.length]);
  }
  return result;
}

function filterRenderable(
  values: readonly string[],
  allowed: Set<string>,
  starterColour: string | undefined,
  definitions?: Record<string, [number, number, number]>,
) {
  return uniqueClean([...values]).filter(
    (value) =>
      allowed.has(value.toUpperCase()) &&
      !isNearStarterColour(starterColour, value, definitions),
  );
}

function pickArchetypeWeightedColour(
  fullPool: string[],
  preferredPool: string[],
  random: RandomFn,
) {
  if (fullPool.length === 0) return null;
  const available = new Set(fullPool.map((value) => value.toUpperCase()));
  const preferred = uniqueClean([...preferredPool]).filter((value) =>
    available.has(value.toUpperCase()),
  );
  const usePreferred = preferred.length > 0 && random() < PREFERRED_COLOUR_BIAS;
  return pickOne(usePreferred ? preferred : fullPool, random);
}

function withoutUsedColours(pool: string[], used: Set<string>) {
  const fresh = pool.filter((value) => !used.has(value.toUpperCase()));
  return fresh.length > 0 ? fresh : pool;
}

function pickEvolutionColour(
  starterColour: string | undefined,
  archetype: EvolutionArchetype,
  level: EvolutionLevel,
  pools: EvolutionPools,
  random: RandomFn,
  usedColours: Set<string> = new Set(),
) {
  const definitions = pools.colourDefinitions;
  const config = ARCHETYPE_CONFIG[archetype];
  const baseSet = new Set(
    pools.baseColours.map((value) => value.toUpperCase()),
  );
  const experimentalSet = new Set(
    pools.experimentalColours.map((value) => value.toUpperCase()),
  );
  const useExperimental = random() < EXPERIMENTAL_CHANCE[level];

  // Clan palette assignment: controlled clans stay inside their own colour
  // set; wild clans may open up to the full pool.
  const clanPool = pools.clanColours?.[archetype];
  let experimentalSource = pools.experimentalColours;
  let clanRestricted = false;
  if (clanPool && clanPool.length > 0) {
    const rollOpen =
      WILD_ARCHETYPE_SET.has(archetype) && random() < WILD_OPEN_CHANCE;
    if (!rollOpen) {
      experimentalSource = clanPool;
      clanRestricted = true;
    }
  }

  const experimentalPool = withoutUsedColours(
    filterRenderable(
      experimentalSource,
      experimentalSet,
      starterColour,
      definitions,
    ),
    usedColours,
  );
  const basePool = withoutUsedColours(
    filterRenderable(pools.baseColours, baseSet, starterColour, definitions),
    usedColours,
  );

  const orderedPools = useExperimental
    ? [
        {
          full: experimentalPool,
          preferred: config.experimental,
        },
        {
          full: basePool,
          preferred: config.base,
        },
      ]
    : [
        {
          full: basePool,
          preferred: config.base,
        },
        {
          full: experimentalPool,
          preferred: config.experimental,
        },
      ];

  for (const pool of orderedPools) {
    // Inside an assigned clan pool every palette colour is equally fair
    // game; the preferred-list bias only applies to the legacy open pool.
    const picked =
      clanRestricted && pool.full === experimentalPool
        ? pickOne(pool.full, random)
        : pickArchetypeWeightedColour(pool.full, pool.preferred, random);
    if (picked) return picked;
  }

  return (
    pickOne([...pools.experimentalColours, ...pools.baseColours], random) ??
    starterColour ??
    "GINGER"
  );
}

function branchLabel(index: number) {
  return String.fromCharCode("A".charCodeAt(0) + index);
}

function formatTortieLayer(layer: TortieLayer) {
  return [layer.mask, layer.pattern, layer.colour].filter(Boolean).join(" / ");
}

export function getTortieLayerParts(
  layer: TortieLayer | null | undefined,
): EvolutionTortiePart[] {
  if (!layer) return [];
  const parts: EvolutionTortiePart[] = [];
  if (layer.mask) {
    parts.push({ kind: "mask", label: "Mask", value: layer.mask });
  }
  if (layer.pattern) {
    parts.push({ kind: "pattern", label: "Pelt", value: layer.pattern });
  }
  if (layer.colour) {
    parts.push({ kind: "colour", label: "Colour", value: layer.colour });
  }
  return parts;
}

function createCatData(
  parent: EvolutionCatData,
  changes: readonly EvolutionTraitChange[],
  meta: EvolutionCatMeta,
  system: CatSystemDefinition = catSystem,
): EvolutionCatData {
  const document = applyEvolutionTraitChanges({
    parent: parent.document,
    changes,
    system,
  });
  return projectEvolutionCatData(document, meta);
}

function additionsToTraitChanges(
  additions: readonly EvolutionAddition[],
): EvolutionTraitChange[] {
  return additions.map((addition) => ({
    traitId: addition.traitId,
    value: addition.traitValue,
    ...("previousValue" in addition && addition.previousValue !== undefined
      ? { previous: addition.previousValue }
      : {}),
  }));
}

function splitSlots(catData: EvolutionCatData) {
  return {
    accessories: uniqueClean(catData.accessorySlots),
    scars: uniqueClean(catData.scarSlots),
    torties: catData.tortieSlots
      .map((layer) => normalizeTortieLayer(layer))
      .filter((layer): layer is TortieLayer => Boolean(layer)),
  };
}

function getAccessoryCategoryPools(pools: EvolutionPools) {
  const plant = uniqueClean(pools.plantAccessories ?? []);
  const wild = uniqueClean(pools.wildAccessories ?? []);
  const collar = uniqueClean(pools.collarAccessories ?? []);
  const known = new Set([...plant, ...wild, ...collar]);
  const extra =
    pools.extraAccessories && pools.extraAccessories.length > 0
      ? uniqueClean(pools.extraAccessories)
      : uniqueClean(pools.accessories).filter((value) => !known.has(value));
  return { plant, wild, collar, extra };
}

function pickAccessory(
  level: EvolutionLevel,
  pools: EvolutionPools,
  used: Set<string>,
  random: RandomFn,
) {
  const byCategory = getAccessoryCategoryPools(pools);
  const weights = ACCESSORY_CATEGORY_WEIGHTS[level];
  const categories = (
    Object.keys(weights) as Array<keyof typeof weights>
  ).filter((category) => byCategory[category].length > 0);
  const availableCategories = categories.filter((category) =>
    byCategory[category].some((value) => !used.has(value)),
  );
  const sourceCategories =
    availableCategories.length > 0 ? availableCategories : categories;
  if (sourceCategories.length > 0) {
    const pickedCategory = weightedPick(
      sourceCategories.map((category) => [category, weights[category]]),
      random,
    );
    const picked = pickUniqueString(byCategory[pickedCategory], used, random);
    if (picked) return picked;
  }
  return pickUniqueString(pools.accessories, used, random);
}

function genericEvolutionSlotTraits(
  system: CatSystemDefinition,
  controls: EvolutionControls,
): AnyCatTraitDefinition[] {
  return [...system.traits]
    .filter(
      (trait) =>
        // Named range controls are the existing themed product plugins. A new
        // registry trait has no such control and therefore enters this pool.
        !isEvolutionRange(
          (controls as unknown as Record<string, unknown>)[trait.id],
        ) &&
        trait.value.kind === "stringList" &&
        trait.capabilities.evolution === "accumulate" &&
        trait.gacha.strategy === "slotList",
    )
    .sort(
      (left, right) =>
        left.order - right.order || left.id.localeCompare(right.id),
    );
}

function isEvolutionRange(value: unknown): value is EvolutionRange {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).min === "number" &&
    typeof (value as Record<string, unknown>).max === "number"
  );
}

function evolutionCatalogFor(
  catalogs: GachaCatalogs,
  catalogId: string,
  pose: unknown,
): GachaCatalog | undefined {
  const catalog = catalogs[catalogId];
  if (
    catalog?.byPose &&
    typeof pose === "string" &&
    catalog.byPose[pose] !== undefined
  ) {
    return { pools: [catalog.byPose[pose]], weights: catalog.weights };
  }
  return catalog;
}

function evolutionCatalogValues(catalog: GachaCatalog | undefined): string[] {
  if (!catalog) return [];
  return Array.from(
    new Set(
      catalog.pools
        .flatMap((pool) => [...pool])
        .filter((value) => typeof value === "string" && value.length > 0),
    ),
  );
}

function appendGenericEvolutionTraits({
  parent,
  traits,
  catalogs,
  random,
  additions,
  rolls,
}: {
  parent: EvolutionCatData;
  traits: readonly AnyCatTraitDefinition[];
  catalogs: GachaCatalogs;
  random: RandomFn;
  additions: EvolutionAddition[];
  rolls: EvolutionRoll[];
}): void {
  const randomSource = { nextFloat: random };
  const parentTraits = parent.document.traits as Record<string, unknown>;
  const pose = parentTraits.pose;
  const gateResults = new Map<string, boolean>();

  for (const trait of traits) {
    const binding = trait.gacha;
    if (
      binding.strategy !== "slotList" ||
      trait.value.kind !== "stringList" ||
      trait.capabilities.evolution !== "accumulate"
    ) {
      continue;
    }

    if (binding.gate) {
      let active = gateResults.get(binding.gate.group);
      if (active === undefined) {
        active = roll(randomSource, binding.gate.probability);
        gateResults.set(binding.gate.group, active);
      }
      if (!active) continue;
    }

    const catalog = evolutionCatalogFor(catalogs, binding.catalog, pose);
    const current = Array.isArray(parentTraits[trait.id])
      ? (parentTraits[trait.id] as unknown[]).filter(
          (value): value is string => typeof value === "string",
        )
      : [];
    const enforceUnique = binding.unique || trait.value.unique === true;
    const owned = new Set(current);
    const available = evolutionCatalogValues(catalog).filter(
      (value) => !enforceUnique || !owned.has(value),
    );
    if (available.length === 0) continue;

    const remaining =
      trait.value.maxItems === undefined
        ? Number.POSITIVE_INFINITY
        : Math.max(0, trait.value.maxItems - current.length);
    const slotCount = Math.min(
      remaining,
      Math.max(0, resolveCount(randomSource, binding.count)),
    );
    if (slotCount <= 0) continue;

    const selected = materializeSlots({
      random: randomSource,
      slotCount,
      availableChoices: available,
      unique: enforceUnique,
      exactCount: false,
      placeholder: null,
      shouldFillSlot: () => roll(randomSource, binding.fillProbability ?? 1),
      choiceWeight: (choice) => catalog?.weights?.[choice] ?? 1,
      mapChoice: (choice) => choice,
      mapValueToSlot: (choice) => choice,
    }).selectedValues;

    for (const value of selected) {
      additions.push({
        kind: "trait",
        traitId: trait.id,
        label: `${trait.label} ${value}`,
        value,
        traitValue: value,
      });
      rolls.push({
        kind: "trait",
        traitId: trait.id,
        label: trait.label,
        value,
      });
    }
  }
}

export function generateEvolutionBatch(
  starterInput: unknown,
  controlsInput: Partial<EvolutionControls>,
  pools: EvolutionPools,
  options: EvolutionBatchOptions = {},
): EvolutionBatchResult {
  const random = options.random ?? Math.random;
  const system = options.system ?? catSystem;
  const controls = normalizeEvolutionControls(controlsInput);
  const genericTraits = genericEvolutionSlotTraits(system, controls);
  const catalogs =
    options.catalogs ??
    (genericTraits.length > 0 ? createGachaCatalogs() : ({} as GachaCatalogs));
  const starterData = normalizeEvolutionStarter(starterInput, { system });
  const requestedArchetypes = (options.archetypes ?? [])
    .filter((archetype) => ARCHETYPE_RING.includes(archetype))
    .slice(0, 12);
  if (requestedArchetypes.length > 0) {
    controls.branchCount = requestedArchetypes.length;
  }
  const starter: EvolutionGeneratedCat = {
    key: "starter",
    label: "The Kit",
    branchIndex: null,
    branchLabel: null,
    level: 0,
    archetype: null,
    additions: [],
    rolls: [],
    catData: starterData,
  };

  const branchArchetypes =
    requestedArchetypes.length > 0
      ? requestedArchetypes
      : chooseBranchArchetypes(
          starterData.params.colour,
          controls.branchCount,
          pools.colourDefinitions,
        );
  const cats: EvolutionGeneratedCat[] = [starter];

  for (
    let branchIndex = 0;
    branchIndex < controls.branchCount;
    branchIndex += 1
  ) {
    const label = branchLabel(branchIndex);
    const archetype = branchArchetypes[branchIndex];
    let parent = clone(starterData);
    const usedAccessories = new Set(splitSlots(parent).accessories);
    const usedScars = new Set(splitSlots(parent).scars);
    const usedMasks = new Set(
      splitSlots(parent)
        .torties.map((layer) => layer.mask)
        .filter((mask): mask is string => Boolean(mask)),
    );
    const usedColours = new Set(
      splitSlots(parent)
        .torties.map((layer) => layer.colour?.toUpperCase())
        .filter((colour): colour is string => Boolean(colour)),
    );

    for (let level = 1; level <= controls.targetLevel; level += 1) {
      const typedLevel = level as EvolutionLevel;
      const parentSlots = splitSlots(parent);
      const nextAccessories = [...parentSlots.accessories];
      const nextScars = [...parentSlots.scars];
      const nextTorties = parentSlots.torties.map((layer) => ({ ...layer }));
      const additions: EvolutionAddition[] = [];
      const rolls: EvolutionRoll[] = [];

      // One-way coat growth: a shorthair line can grow out and stays long.
      let coatGrew = false;
      if (
        Number(parent.params.spriteNumber) === SHORT_HAIR_SPRITE &&
        random() < COAT_GROWTH_CHANCE
      ) {
        coatGrew = true;
        rolls.push({ kind: "coat", label: "Coat", value: "Long hair" });
        additions.push({
          kind: "coat",
          traitId: "pose",
          label: "Coat grew long",
          value: "Long hair",
          traitValue: LONG_HAIR_POSE,
        });
      }

      // Rare replacement: reroll one trait the cat already owns.
      const replaceable: Array<{
        slot: EvolutionReplacementSlot;
        index: number;
      }> = [
        ...nextTorties.map((_, index) => ({ slot: "tortie" as const, index })),
        ...nextAccessories.map((_, index) => ({
          slot: "accessory" as const,
          index,
        })),
        ...(controls.scarsEnabled
          ? nextScars.map((_, index) => ({ slot: "scar" as const, index }))
          : []),
      ];
      if (replaceable.length > 0 && random() < REPLACEMENT_CHANCE) {
        const target =
          replaceable[
            Math.min(
              Math.floor(random() * replaceable.length),
              replaceable.length - 1,
            )
          ];
        if (target.slot === "tortie") {
          const mask = pickUniqueString(pools.tortieMasks, usedMasks, random);
          const pattern = pickOne(pools.tortiePatterns, random);
          if (mask && pattern) {
            const colour = pickEvolutionColour(
              starterData.params.colour,
              archetype,
              typedLevel,
              pools,
              random,
              usedColours,
            );
            usedColours.add(colour.toUpperCase());
            const previousLayer = { ...nextTorties[target.index] };
            const previous = formatTortieLayer(previousLayer);
            const layer: TortieLayer = { mask, pattern, colour };
            nextTorties[target.index] = layer;
            const value = formatTortieLayer(layer);
            rolls.push({
              kind: "replacement",
              label: "Replacement",
              slot: "tortie",
              value: `${previous} → ${value}`,
            });
            additions.push({
              kind: "replacement",
              traitId: "tortie",
              slot: "tortie",
              label: `Replaced tortie ${previous}`,
              previous,
              value,
              previousValue: previousLayer,
              traitValue: layer,
            });
          }
        } else if (target.slot === "accessory") {
          const accessory = pickAccessory(
            typedLevel,
            pools,
            usedAccessories,
            random,
          );
          if (accessory) {
            const previous = nextAccessories[target.index];
            nextAccessories[target.index] = accessory;
            rolls.push({
              kind: "replacement",
              label: "Replacement",
              slot: "accessory",
              value: `${previous} → ${accessory}`,
            });
            additions.push({
              kind: "replacement",
              traitId: "accessories",
              slot: "accessory",
              label: `Replaced accessory ${previous}`,
              previous,
              value: accessory,
              previousValue: previous,
              traitValue: accessory,
            });
          }
        } else {
          const scar = pickUniqueString(pools.scars, usedScars, random);
          if (scar) {
            const previous = nextScars[target.index];
            nextScars[target.index] = scar;
            rolls.push({
              kind: "replacement",
              label: "Replacement",
              slot: "scar",
              value: `${previous} → ${scar}`,
            });
            additions.push({
              kind: "replacement",
              traitId: "scars",
              slot: "scar",
              label: `Replaced scar ${previous}`,
              previous,
              value: scar,
              previousValue: previous,
              traitValue: scar,
            });
          }
        }
      }

      const tortieCount = pickCount(
        controls.torties,
        TORTIE_COUNT_WEIGHTS,
        random,
      );
      rolls.push({
        kind: "tortie-count",
        label: "Tortie layers",
        value: tortieCount,
        range: { ...controls.torties },
      });
      for (let i = 0; i < tortieCount; i += 1) {
        const mask = pickUniqueString(pools.tortieMasks, usedMasks, random);
        const pattern = pickOne(pools.tortiePatterns, random);
        if (!mask || !pattern) continue;
        const colour = pickEvolutionColour(
          starterData.params.colour,
          archetype,
          typedLevel,
          pools,
          random,
          usedColours,
        );
        usedColours.add(colour.toUpperCase());
        const layer: TortieLayer = { mask, pattern, colour };
        const parts = getTortieLayerParts(layer);
        for (const part of parts) {
          rolls.push({
            kind: "tortie-part",
            label: `Tortie ${i + 1} ${part.label}`,
            layerIndex: i + 1,
            part: part.kind,
            value: part.value,
          });
        }
        nextTorties.push(layer);
        additions.push({
          kind: "tortie",
          traitId: "tortie",
          label: `Tortie ${formatTortieLayer(layer)}`,
          value: layer,
          traitValue: layer,
          parts,
        });
      }

      const scarCount = controls.scarsEnabled
        ? pickCount(controls.scars, SCAR_COUNT_WEIGHTS, random)
        : 0;
      for (let i = 0; i < scarCount; i += 1) {
        const scar = pickUniqueString(pools.scars, usedScars, random);
        if (!scar) continue;
        nextScars.push(scar);
        rolls.push({ kind: "scar", label: "Scar", value: scar });
        additions.push({
          kind: "scar",
          traitId: "scars",
          label: `Scar ${scar}`,
          value: scar,
          traitValue: scar,
        });
      }

      const accessoryCount = pickCount(
        controls.accessories,
        ACCESSORY_COUNT_WEIGHTS,
        random,
      );
      for (let i = 0; i < accessoryCount; i += 1) {
        const accessory = pickAccessory(
          typedLevel,
          pools,
          usedAccessories,
          random,
        );
        if (!accessory) continue;
        nextAccessories.push(accessory);
        rolls.push({ kind: "accessory", label: "Accessory", value: accessory });
        additions.push({
          kind: "accessory",
          traitId: "accessories",
          label: `Accessory ${accessory}`,
          value: accessory,
          traitValue: accessory,
        });
      }

      appendGenericEvolutionTraits({
        parent,
        traits: genericTraits,
        catalogs,
        random,
        additions,
        rolls,
      });

      const meta: EvolutionCatMeta = {
        source: EVOLUTION_SOURCE,
        policy: EVOLUTION_POLICY,
        role: "branch",
        branchIndex,
        branchLabel: label,
        level: typedLevel,
        archetype,
        additions,
        rolls,
      };
      const nextParams = coatGrew
        ? applyEvolutionStarterHairToParams(
            clone(parent.params),
            EVOLUTION_STARTER_HAIR_STYLES.long,
          )
        : parent.params;
      const evolutionParent = coatGrew
        ? {
            ...parent,
            document: parseEvolutionDocumentForSystem(
              {
                ...parent.document,
                traits: {
                  ...parent.document.traits,
                  pose: LONG_HAIR_POSE,
                },
              },
              system,
            ),
            params: nextParams,
          }
        : parent;
      const catData = createCatData(
        evolutionParent,
        additionsToTraitChanges(additions),
        meta,
        system,
      );
      cats.push({
        key: `branch-${branchIndex}-level-${level}`,
        label: `Line ${label} ${STAGE_RANK_LABELS[typedLevel]}`,
        branchIndex,
        branchLabel: label,
        level: typedLevel,
        archetype,
        additions,
        rolls,
        catData,
      });
      parent = catData;
    }
  }

  return { starter, cats, branchArchetypes, controls };
}

export function buildEvolutionBatchSettings(
  result: EvolutionBatchResult,
  starterSource: EvolutionStarterSource,
  generatedAt = Date.now(),
): EvolutionBatchSettings {
  return {
    source: EVOLUTION_SOURCE,
    evolutionPolicy: EVOLUTION_POLICY,
    branchCount: result.controls.branchCount,
    targetLevel: result.controls.targetLevel,
    totalCats: result.cats.length,
    generatedAt,
    starter: {
      ...starterSource,
      colour: result.starter.catData.params.colour,
      peltName: result.starter.catData.params.peltName,
      coatPattern: result.starter.catData.params.coatPattern,
    },
    layerRanges: {
      torties: result.controls.torties,
      accessories: result.controls.accessories,
      scars: result.controls.scars,
      scarsEnabled: result.controls.scarsEnabled,
    },
    branchArchetypes: [...result.branchArchetypes],
  };
}

/**
 * Build a plausible "could have been" variant of an upcoming evolution for
 * the ceremony's slot-machine tease. The variant starts from the parent cat
 * and adds randomly-valued traits whose counts are bounded by what the real
 * evolution actually rolled: 0..N new torties when the result gained N, no
 * teased scars when none were gained, a possible coat flip only when the
 * result changed coat, and so on. Values are fully random — only the shape
 * follows the result.
 */
export function generateTeaserVariant(
  parentInput: unknown,
  additions: EvolutionAddition[],
  pools: EvolutionPools,
  options: { random?: RandomFn; archetype?: EvolutionArchetype | null } = {},
): CatParams {
  const random = options.random ?? Math.random;
  const parent = normalizeEvolutionStarter(parentInput);
  const traitChanges: EvolutionTraitChange[] = [];
  const accessories = [...parent.accessorySlots];
  const scars = [...parent.scarSlots];
  const torties = parent.tortieSlots
    .map((layer) => normalizeTortieLayer(layer))
    .filter((layer): layer is TortieLayer => Boolean(layer));
  const fullColours = uniqueClean([
    ...pools.baseColours,
    ...pools.experimentalColours,
  ]);
  // Teased colours respect the clan's palette assignment, just like the
  // real roll: controlled clans stay inside their palettes (+ naturals),
  // wild clans may open up to the whole pool.
  const archetype = options.archetype ?? null;
  const clanAssigned = archetype ? pools.clanColours?.[archetype] : undefined;
  const clanColours =
    clanAssigned && clanAssigned.length > 0
      ? uniqueClean([...clanAssigned, ...pools.baseColours])
      : null;
  const wild = archetype ? WILD_ARCHETYPE_SET.has(archetype) : false;
  const teaseColour = () => {
    if (!clanColours) return pickOne(fullColours, random);
    if (wild && random() < WILD_OPEN_CHANCE)
      return pickOne(fullColours, random);
    return pickOne(clanColours, random);
  };

  const randomIndex = (length: number) =>
    Math.min(Math.floor(random() * length), length - 1);
  const rollCount = (max: number) =>
    max <= 0 ? 0 : Math.min(max, Math.floor(random() * (max + 1)));
  const randomLayer = (): TortieLayer | null => {
    const mask = pickOne(pools.tortieMasks, random);
    const pattern = pickOne(pools.tortiePatterns, random);
    const colour = teaseColour();
    return mask && pattern && colour ? { mask, pattern, colour } : null;
  };
  const countOf = (kind: EvolutionAddition["kind"]) =>
    additions.filter((addition) => addition.kind === kind).length;

  // Tease replacements as a coin-flip reroll of one owned trait.
  for (const addition of additions) {
    if (addition.kind !== "replacement" || random() < 0.5) continue;
    if (addition.slot === "tortie" && torties.length > 0) {
      const layer = randomLayer();
      if (layer) {
        const index = randomIndex(torties.length);
        const previous = torties[index];
        torties[index] = layer;
        traitChanges.push({
          traitId: addition.traitId,
          previous,
          value: layer,
        });
      }
    } else if (addition.slot === "accessory" && accessories.length > 0) {
      const accessory = pickOne(pools.accessories, random);
      if (accessory) {
        const index = randomIndex(accessories.length);
        const previous = accessories[index];
        accessories[index] = accessory;
        traitChanges.push({
          traitId: addition.traitId,
          previous,
          value: accessory,
        });
      }
    } else if (addition.slot === "scar" && scars.length > 0) {
      const scar = pickOne(pools.scars, random);
      if (scar) {
        const index = randomIndex(scars.length);
        const previous = scars[index];
        scars[index] = scar;
        traitChanges.push({
          traitId: addition.traitId,
          previous,
          value: scar,
        });
      }
    }
  }

  const tortieAdds = rollCount(countOf("tortie"));
  for (let i = 0; i < tortieAdds; i += 1) {
    const layer = randomLayer();
    if (layer) {
      torties.push(layer);
      traitChanges.push({ traitId: "tortie", value: layer });
    }
  }
  const accessoryAdds = rollCount(countOf("accessory"));
  for (let i = 0; i < accessoryAdds; i += 1) {
    const accessory = pickOne(pools.accessories, random);
    if (accessory) {
      accessories.push(accessory);
      traitChanges.push({ traitId: "accessories", value: accessory });
    }
  }
  const scarAdds = rollCount(countOf("scar"));
  for (let i = 0; i < scarAdds; i += 1) {
    const scar = pickOne(pools.scars, random);
    if (scar) {
      scars.push(scar);
      traitChanges.push({ traitId: "scars", value: scar });
    }
  }

  for (const addition of additions) {
    if (addition.kind !== "trait" || random() >= 0.5) continue;
    traitChanges.push({
      traitId: addition.traitId,
      value: addition.traitValue,
      ...(addition.previousValue !== undefined
        ? { previous: addition.previousValue }
        : {}),
    });
  }

  let document = applyEvolutionTraitChanges({
    parent: parent.document,
    changes: traitChanges,
  });
  if (countOf("coat") > 0 && random() < 0.5) {
    document = readCatDocument({
      ...document,
      traits: { ...document.traits, pose: LONG_HAIR_POSE },
    });
  }
  return documentToEvolutionParams(document);
}

export function isEvolutionBatchSettings(settings: unknown): boolean {
  return (
    Boolean(settings) &&
    typeof settings === "object" &&
    (settings as Record<string, unknown>).source === EVOLUTION_SOURCE
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEvolutionMetaRecord(meta: Record<string, unknown>) {
  const role = meta.role;
  const level = meta.level;
  const branchIndex = meta.branchIndex;
  const branchLabel = meta.branchLabel;
  const archetype = meta.archetype;
  return (
    (role === "starter" || role === "branch") &&
    (level === 0 || level === 1 || level === 2 || level === 3) &&
    (branchIndex === null || typeof branchIndex === "number") &&
    (branchLabel === null || typeof branchLabel === "string") &&
    (archetype === null || isEvolutionArchetype(archetype)) &&
    Array.isArray(meta.additions) &&
    Array.isArray(meta.rolls)
  );
}

export function getEvolutionMeta(catData: unknown): EvolutionCatMeta | null {
  if (!isRecord(catData)) return null;
  const meta = catData.evolution;
  if (!isRecord(meta)) return null;
  const source = meta.source;
  const policy = meta.policy;
  if (source !== EVOLUTION_SOURCE || policy !== EVOLUTION_POLICY) return null;
  if (!isEvolutionMetaRecord(meta)) return null;
  return meta as EvolutionCatMeta;
}
