import type { CatParams, TortieLayer } from "@/lib/cat-v3/types";

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
};

export type EvolutionTortiePart = {
  kind: "mask" | "pattern" | "colour";
  label: "Mask" | "Pelt" | "Colour";
  value: string;
};

export type EvolutionCatData = {
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

export type EvolutionAddition =
  | {
      kind: "tortie";
      label: string;
      value: TortieLayer;
      parts: EvolutionTortiePart[];
    }
  | {
      kind: "accessory" | "scar";
      label: string;
      value: string;
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
  1: 0.12,
  2: 0.22,
  3: 0.32,
};

const TORTIE_COUNT_WEIGHTS: Record<number, number> = {
  0: 0.1,
  1: 0.65,
  2: 0.35,
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

function clampRange(value: Partial<EvolutionRange> | undefined, fallback: EvolutionRange) {
  const min = clampInt(value?.min, 0, 2, fallback.min);
  const max = clampInt(value?.max, 0, 2, fallback.max);
  return min <= max ? { min, max } : { min: max, max: min };
}

export function normalizeEvolutionControls(
  value: Partial<EvolutionControls> = {},
): EvolutionControls {
  return {
    branchCount: clampInt(value.branchCount, 1, 12, DEFAULT_CONTROLS.branchCount),
    targetLevel: clampInt(
      value.targetLevel,
      1,
      3,
      DEFAULT_CONTROLS.targetLevel,
    ) as EvolutionLevel,
    torties: clampRange(value.torties, DEFAULT_CONTROLS.torties),
    accessories: clampRange(value.accessories, DEFAULT_CONTROLS.accessories),
    scars: clampRange(value.scars, DEFAULT_CONTROLS.scars),
    scarsEnabled: value.scarsEnabled ?? DEFAULT_CONTROLS.scarsEnabled,
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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

export function normalizeEvolutionStarter(input: unknown): EvolutionCatData {
  if (!input || typeof input !== "object") {
    throw new Error("Evolution starter payload is missing");
  }

  const raw = input as Record<string, unknown>;
  const paramsSource =
    raw.params && typeof raw.params === "object"
      ? (raw.params as Record<string, unknown>)
      : raw;
  const params = clone(paramsSource) as unknown as CatParams;
  const accessories = normalizeStringSlots(
    raw.accessorySlots,
    params.accessories,
    params.accessory,
  );
  const scars = normalizeStringSlots(raw.scarSlots, params.scars, params.scar);
  const torties = normalizeTortieSlots({ ...params, tortieSlots: raw.tortieSlots });
  const normalizedParams = applySlotsToParams(params, accessories, scars, torties);

  return {
    params: normalizedParams,
    accessorySlots: accessories,
    scarSlots: scars,
    tortieSlots: torties.map((layer) => ({ ...layer })),
    counts: {
      accessories: accessories.length,
      scars: scars.length,
      tortie: torties.length,
    },
    evolution: {
      source: EVOLUTION_SOURCE,
      policy: EVOLUTION_POLICY,
      role: "starter",
      branchIndex: null,
      branchLabel: null,
      level: 0,
      archetype: null,
      additions: [],
      rolls: [],
    },
  };
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
  const selected = pickOne(available.length > 0 ? available : cleanPool, random);
  if (selected) used.add(selected);
  return selected;
}

function rgbDistance(
  a: [number, number, number],
  b: [number, number, number],
) {
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
  if (starterColour.toUpperCase() === candidateColour.toUpperCase()) return true;
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

  return ARCHETYPE_RING.reduce((best, current) => {
    const distance = rgbDistance(starterRgb, ARCHETYPE_CONFIG[current].anchor);
    return distance < best.distance ? { archetype: current, distance } : best;
  }, {
    archetype: "sun" as EvolutionArchetype,
    distance: Number.POSITIVE_INFINITY,
  }).archetype;
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
  const normalizedCount = clampInt(branchCount, 1, 12, DEFAULT_CONTROLS.branchCount);
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
  const usePreferred = preferred.length > 0 && random() < 0.65;
  return pickOne(usePreferred ? preferred : fullPool, random);
}

function pickEvolutionColour(
  starterColour: string | undefined,
  archetype: EvolutionArchetype,
  level: EvolutionLevel,
  pools: EvolutionPools,
  random: RandomFn,
) {
  const definitions = pools.colourDefinitions;
  const config = ARCHETYPE_CONFIG[archetype];
  const baseSet = new Set(pools.baseColours.map((value) => value.toUpperCase()));
  const experimentalSet = new Set(
    pools.experimentalColours.map((value) => value.toUpperCase()),
  );
  const useExperimental = random() < EXPERIMENTAL_CHANCE[level];

  const experimentalPool = filterRenderable(
    pools.experimentalColours,
    experimentalSet,
    starterColour,
    definitions,
  );
  const basePool = filterRenderable(
    pools.baseColours,
    baseSet,
    starterColour,
    definitions,
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
    const picked = pickArchetypeWeightedColour(
      pool.full,
      pool.preferred,
      random,
    );
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
  return [layer.mask, layer.pattern, layer.colour]
    .filter(Boolean)
    .join(" / ");
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
  params: CatParams,
  accessories: string[],
  scars: string[],
  torties: TortieLayer[],
  meta: EvolutionCatMeta,
): EvolutionCatData {
  const normalizedParams = applySlotsToParams(params, accessories, scars, torties);
  return {
    params: normalizedParams,
    accessorySlots: [...accessories],
    scarSlots: [...scars],
    tortieSlots: torties.map((layer) => ({ ...layer })),
    counts: {
      accessories: accessories.length,
      scars: scars.length,
      tortie: torties.length,
    },
    evolution: clone(meta),
  };
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
  const categories = (Object.keys(weights) as Array<keyof typeof weights>).filter(
    (category) => byCategory[category].length > 0,
  );
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

export function generateEvolutionBatch(
  starterInput: unknown,
  controlsInput: Partial<EvolutionControls>,
  pools: EvolutionPools,
  options: { random?: RandomFn } = {},
): EvolutionBatchResult {
  const random = options.random ?? Math.random;
  const controls = normalizeEvolutionControls(controlsInput);
  const starterData = normalizeEvolutionStarter(starterInput);
  const starter: EvolutionGeneratedCat = {
    key: "starter",
    label: "Starter",
    branchIndex: null,
    branchLabel: null,
    level: 0,
    archetype: null,
    additions: [],
    rolls: [],
    catData: starterData,
  };

  const branchArchetypes = chooseBranchArchetypes(
    starterData.params.colour,
    controls.branchCount,
    pools.colourDefinitions,
  );
  const cats: EvolutionGeneratedCat[] = [starter];

  for (let branchIndex = 0; branchIndex < controls.branchCount; branchIndex += 1) {
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

    for (let level = 1; level <= controls.targetLevel; level += 1) {
      const typedLevel = level as EvolutionLevel;
      const parentSlots = splitSlots(parent);
      const nextAccessories = [...parentSlots.accessories];
      const nextScars = [...parentSlots.scars];
      const nextTorties = parentSlots.torties.map((layer) => ({ ...layer }));
      const additions: EvolutionAddition[] = [];
      const rolls: EvolutionRoll[] = [];

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
        );
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
          label: `Tortie ${formatTortieLayer(layer)}`,
          value: layer,
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
        additions.push({ kind: "scar", label: `Scar ${scar}`, value: scar });
      }

      const accessoryCount = pickCount(
        controls.accessories,
        ACCESSORY_COUNT_WEIGHTS,
        random,
      );
      for (let i = 0; i < accessoryCount; i += 1) {
        const accessory = pickAccessory(typedLevel, pools, usedAccessories, random);
        if (!accessory) continue;
        nextAccessories.push(accessory);
        rolls.push({ kind: "accessory", label: "Accessory", value: accessory });
        additions.push({
          kind: "accessory",
          label: `Accessory ${accessory}`,
          value: accessory,
        });
      }

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
      const catData = createCatData(
        parent.params,
        nextAccessories,
        nextScars,
        nextTorties,
        meta,
      );
      cats.push({
        key: `branch-${branchIndex}-level-${level}`,
        label: `Branch ${label} Evolution ${level}`,
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

export function isEvolutionBatchSettings(settings: unknown): boolean {
  return (
    Boolean(settings) &&
    typeof settings === "object" &&
    (settings as Record<string, unknown>).source === EVOLUTION_SOURCE
  );
}

export function getEvolutionMeta(catData: unknown): EvolutionCatMeta | null {
  if (!catData || typeof catData !== "object") return null;
  const meta = (catData as Record<string, unknown>).evolution;
  if (!meta || typeof meta !== "object") return null;
  const source = (meta as Record<string, unknown>).source;
  const policy = (meta as Record<string, unknown>).policy;
  if (source !== EVOLUTION_SOURCE || policy !== EVOLUTION_POLICY) return null;
  return meta as EvolutionCatMeta;
}
