import { catDocumentToLegacyParams } from "@/lib/cat-system/document";
import {
  createGachaCatalogs,
  type GachaCountsMode,
  type GachaSeed,
  type GachaSlotOverrides,
  rollCatFromRegistry,
} from "@/lib/cat-system/gacha";
import type { CatDocument } from "@/lib/cat-system/runtime";
import config from "./random-config.json";
import type {
  CatParams,
  RandomGenerationOptions as LegacyRandomGenerationOptions,
  RandomGenerationResult,
  SlotSelections,
} from "./types";

export type RandomGenerationOptions = Omit<
  LegacyRandomGenerationOptions,
  "countsMode" | "slotOverrides"
> & {
  seed?: GachaSeed;
  countsMode?: GachaCountsMode;
  slotOverrides?: GachaSlotOverrides;
};

export type SeededRandomGenerationResult = RandomGenerationResult & {
  document: CatDocument;
  seed: GachaSeed;
  rngVersion: "xoshiro128**-v1";
};

interface SpriteMapperApi {
  loaded: boolean;
  init(): Promise<boolean>;
  getPoseNames?(): string[];
  getRenderablePoseNames(): string[];
  getPeltNames(): string[];
  getColourOptions(mode?: unknown, includeBase?: boolean): string[];
  getColours(): string[];
  getExperimentalColoursByMode(mode?: unknown): string[];
  getTints(): string[];
  getWhiteTints?(): string[];
  getWhitePatchColourOptions(
    mode?: string,
    experimentalMode?: unknown,
  ): string[];
  getEyeColours(): string[];
  getSkinColours(): string[];
  getAccessories(): string[];
  getExtraAccessories?(): string[];
  getScars(): string[];
  getPoints(): string[];
  getVitiligo(): string[];
  getTortieMasks(): string[];
  getWhitePatches(): string[];
}

interface RandomConfig {
  defaultSlots?: Record<string, number>;
  whitePatches?: {
    tintMode?: string;
    allowNoneTint?: boolean;
  };
}

const RANDOM_CONFIG = config as RandomConfig;
let spriteMapperInstance: SpriteMapperApi | null = null;
let spriteMapperReady: Promise<SpriteMapperApi> | null = null;

export async function ensureSpriteMapper(): Promise<SpriteMapperApi> {
  if (spriteMapperInstance?.loaded) return spriteMapperInstance;
  if (!spriteMapperReady) {
    spriteMapperReady = (async () => {
      const mod = (await import("@/lib/single-cat/spriteMapper")) as {
        default: SpriteMapperApi;
      };
      const mapper = mod.default;
      if (!mapper.loaded) await mapper.init();
      spriteMapperInstance = mapper;
      return mapper;
    })();
  }
  return spriteMapperReady;
}

function normalizeExperimentalModes(
  mode: RandomGenerationOptions["experimentalColourMode"],
): string[] {
  const result = new Set<string>();
  const visit = (value: string | string[] | undefined): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value === undefined) return;
    const normalized = value.trim().toLowerCase();
    if (normalized && normalized !== "off") result.add(normalized);
  };
  visit(mode);
  return [...result];
}

function buildColourPools(
  mapper: SpriteMapperApi,
  options: RandomGenerationOptions,
): string[][] {
  const pools: string[][] = [];
  const base = mapper.getColours();
  if (options.includeBaseColours !== false && base.length > 0) pools.push(base);
  for (const mode of normalizeExperimentalModes(
    options.experimentalColourMode,
  )) {
    const values = mapper.getExperimentalColoursByMode(mode);
    if (values.length > 0) pools.push(values);
  }
  return pools.length > 0 ? pools : [base];
}

function withLegacyCountOptions(
  options: RandomGenerationOptions,
): GachaSlotOverrides | undefined {
  const slotOverrides: GachaSlotOverrides = {
    ...(options.slotOverrides ?? {}),
  };
  const legacyCounts: Array<
    [
      keyof Pick<
        RandomGenerationOptions,
        "accessoryCount" | "scarCount" | "tortieCount"
      >,
      keyof GachaSlotOverrides,
    ]
  > = [
    ["accessoryCount", "accessories"],
    ["scarCount", "scars"],
    ["tortieCount", "tortie"],
  ];
  for (const [legacyKey, traitId] of legacyCounts) {
    const value = options[legacyKey];
    if (typeof value === "number" && Number.isFinite(value)) {
      slotOverrides[traitId] = Math.max(0, Math.trunc(value));
    }
  }
  return Object.keys(slotOverrides).length > 0 ? slotOverrides : undefined;
}

function dualParams(document: CatDocument): CatParams {
  const legacy = catDocumentToLegacyParams(document);
  for (const key of ["accessories", "scars", "tortie"] as const) {
    if (Array.isArray(legacy[key]) && legacy[key].length === 0) {
      delete legacy[key];
    }
  }
  for (const key of ["lighting", "darkForest", "darkMode", "dead"] as const) {
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

export async function generateRandomParamsV3Detailed(
  options: RandomGenerationOptions = {},
): Promise<SeededRandomGenerationResult> {
  const mapper = await ensureSpriteMapper();
  const experimentalMode = options.experimentalColourMode ?? "off";
  const tintMode =
    options.whitePatchColourMode ??
    RANDOM_CONFIG.whitePatches?.tintMode ??
    "default";
  const filterWhitePatchColours = (values: string[]): string[] =>
    RANDOM_CONFIG.whitePatches?.allowNoneTint === false
      ? values.filter((value) => value !== "none")
      : values;
  const whitePatchColours = filterWhitePatchColours(
    mapper.getWhitePatchColourOptions(tintMode, null),
  );
  const tortieWhitePatchColours = filterWhitePatchColours(
    mapper.getWhitePatchColourOptions(tintMode, experimentalMode),
  );
  const catalogs = createGachaCatalogs({
    colours: buildColourPools(mapper, options),
    whitePatchColours,
    tortieWhitePatchColours,
  });

  const result = rollCatFromRegistry(catalogs, {
    seed: options.seed,
    exactLayerCounts: options.exactLayerCounts,
    countsMode: options.countsMode,
    slotOverrides: withLegacyCountOptions(options),
    defaultSlotCounts: RANDOM_CONFIG.defaultSlots as
      | GachaSlotOverrides
      | undefined,
  });

  return {
    params: dualParams(result.document),
    document: result.document,
    slotSelections: result.slotSelections as unknown as SlotSelections,
    seed: result.seed,
    rngVersion: result.rngVersion,
  };
}

export async function generateRandomParamsV3(
  options: RandomGenerationOptions = {},
): Promise<CatParams> {
  return (await generateRandomParamsV3Detailed(options)).params;
}
