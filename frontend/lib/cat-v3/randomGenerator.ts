import type { CatParams, RandomGenerationOptions, RandomGenerationResult, SlotSelections } from './types';
import { materializeStringSlots, materializeTortieSlots } from './slotMaterializer';
import config from './random-config.json';

type CountCategory = 'tortie' | 'accessories' | 'scars';
type CountStrategy = 'weighted' | 'uniform';

export type { RandomGenerationOptions } from './types';

interface CountConfig {
  weights?: Record<string, number>;
  min?: number;
  max?: number;
  unique?: boolean;
}

interface GenerationConfig {
  version: number;
  spritePool: {
    include: number[];
    excludeDefault?: number[];
  };
  probabilities: Record<string, number>;
  counts: Record<CountCategory, CountConfig> & Record<string, CountConfig>;
  defaultSlots?: Record<string, number>;
  whitePatches: {
    tintMode?: string;
    allowNoneTint?: boolean;
  };
}

const RANDOM_CONFIG = config as GenerationConfig;

interface SpriteMapperApi {
  loaded: boolean;
  init(): Promise<boolean>;
  getColourOptions(mode?: unknown, includeBase?: boolean): string[];
  getExperimentalColoursByMode(mode?: unknown): string[];
  getColours(): string[];
  getPeltNames(): string[];
  getTints(): string[];
  getEyeColours(): string[];
  getSkinColours(): string[];
  getAccessories(): string[];
  getScars(): string[];
  getPoints(): string[];
  getVitiligo(): string[];
  getTortieMasks(): string[];
  getWhitePatches(): string[];
  getWhitePatchColourOptions(mode?: string, experimentalMode?: unknown): string[];
}

let spriteMapperInstance: SpriteMapperApi | null = null;
let spriteMapperReady: Promise<SpriteMapperApi> | null = null;

export async function ensureSpriteMapper() {
  if (spriteMapperInstance?.loaded) {
    return spriteMapperInstance;
  }
  if (!spriteMapperReady) {
    spriteMapperReady = (async () => {
      const mod = (await import('@/lib/single-cat/spriteMapper')) as { default: SpriteMapperApi };
      const mapper = mod.default;
      if (!mapper.loaded) {
        await mapper.init();
      }
      spriteMapperInstance = mapper;
      return mapper;
    })();
  }
  return spriteMapperReady;
}

function roll(probability: number | undefined): boolean {
  if (!probability || probability <= 0) return false;
  if (probability >= 1) return true;
  return Math.random() < probability;
}

function pickOne<T>(items: T[]): T {
  if (!items.length) {
    throw new Error('Attempted to pick from an empty list');
  }
  const index = Math.floor(Math.random() * items.length);
  return items[index];
}

function weightedPick(values: Record<string, number>, fallback: () => number): number {
  const entries = Object.entries(values ?? {})
    .map(([key, weight]) => ({ value: Number(key), weight: Number(weight) }))
    .filter((entry) => Number.isFinite(entry.value) && Number.isFinite(entry.weight) && entry.weight > 0);

  if (!entries.length) {
    return fallback();
  }

  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  const target = Math.random() * total;
  let running = 0;
  for (const entry of entries) {
    running += entry.weight;
    if (target <= running) {
      return entry.value;
    }
  }
  return entries[entries.length - 1].value;
}

function resolveCountsMode(
  category: CountCategory,
  override?: CountStrategy | Partial<Record<CountCategory, CountStrategy>>
): CountStrategy {
  if (!override) {
    return 'weighted';
  }
  if (typeof override === 'string') {
    return override;
  }
  return override[category] ?? 'weighted';
}

function resolveCount(category: CountCategory, mode: CountStrategy, cfg: CountConfig): number {
  const min = cfg.min ?? 0;
  const max = cfg.max ?? min;
  const clampRange = (value: number) => Math.min(Math.max(value, min), max);

  if (min >= max) {
    return min;
  }

  if (mode === 'uniform') {
    const range = [];
    for (let i = min; i <= max; i += 1) {
      range.push(i);
    }
    return pickOne(range);
  }

  return clampRange(weightedPick(cfg.weights ?? {}, () => {
    const range = [];
    for (let i = min; i <= max; i += 1) {
      range.push(i);
    }
    return pickOne(range);
  }));
}

function ensureArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeExperimentalModes(mode: RandomGenerationOptions['experimentalColourMode']): string[] {
  const normalized = new Set<string>();

  const visit = (value: string | string[] | undefined): void => {
    if (value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    const entry = String(value).trim().toLowerCase();
    if (!entry || entry === 'off') return;
    normalized.add(entry);
  };

  visit(mode);
  return Array.from(normalized);
}

function buildColourPools(
  spriteMapper: SpriteMapperApi,
  experimentalMode: RandomGenerationOptions['experimentalColourMode'],
  includeBaseColours: boolean,
): string[][] {
  const pools: string[][] = [];
  const baseColours = spriteMapper.getColours();

  if (includeBaseColours && baseColours.length > 0) {
    pools.push(baseColours);
  }

  for (const mode of normalizeExperimentalModes(experimentalMode)) {
    const colours = spriteMapper.getExperimentalColoursByMode(mode);
    if (colours.length > 0) {
      pools.push(colours);
    }
  }

  if (pools.length > 0) {
    return pools;
  }

  return baseColours.length > 0 ? [baseColours] : [];
}

function flattenPools(pools: readonly string[][]): string[] {
  const combined = new Set<string>();
  for (const pool of pools) {
    for (const colour of pool) {
      combined.add(colour);
    }
  }
  return Array.from(combined);
}

function pickColourFromPools(pools: readonly string[][]): string {
  const availablePools = pools.filter((pool) => pool.length > 0);
  if (!availablePools.length) {
    throw new Error('Attempted to pick from an empty colour pool');
  }
  return pickOne(pickOne([...availablePools]));
}

function hasOverride(
  category: CountCategory,
  override?: CountStrategy | Partial<Record<CountCategory, CountStrategy>>
): boolean {
  if (!override) return false;
  if (typeof override === 'string') return true;
  return override[category] !== undefined;
}

function determineSlotCount(
  category: CountCategory,
  cfg: CountConfig,
  defaults: Record<string, number> | undefined,
  options: RandomGenerationOptions
): number {
  if (options.slotOverrides && options.slotOverrides[category] !== undefined) {
    return Math.max(0, Math.trunc(options.slotOverrides[category]!));
  }
  if (hasOverride(category, options.countsMode)) {
    const mode = resolveCountsMode(category, options.countsMode);
    return Math.max(0, Math.trunc(resolveCount(category, mode, cfg)));
  }
  return Math.max(0, Math.trunc(defaults?.[category] ?? 1));
}

function hasExplicitSlotControl(category: CountCategory, options: RandomGenerationOptions): boolean {
  return options.slotOverrides?.[category] !== undefined || hasOverride(category, options.countsMode);
}

export async function generateRandomParamsV3Detailed(
  options: RandomGenerationOptions = {},
): Promise<RandomGenerationResult> {
  const spriteMapper = await ensureSpriteMapper();

  const spriteInclude = ensureArray(RANDOM_CONFIG.spritePool.include);
  const spriteExcludeDefault = ensureArray(RANDOM_CONFIG.spritePool.excludeDefault);
  const spritePool = options.ignoreForbiddenSprites
    ? spriteInclude.filter((value) => !spriteExcludeDefault.includes(value))
    : spriteInclude;
  if (!spritePool.length) {
    throw new Error('Sprite pool is empty; check random-config.json');
  }
  const spriteNumber = pickOne(spritePool);

  const experimentalMode = options.experimentalColourMode ?? 'off';
  const colourPools = buildColourPools(
    spriteMapper,
    experimentalMode,
    options.includeBaseColours !== false,
  );
  const colours = flattenPools(colourPools);
  if (!colours.length) {
    throw new Error('Colour pool is empty; check palette configuration');
  }
  const pickColour = () => pickColourFromPools(colourPools);

  const pelts = spriteMapper.getPeltNames().filter((p: string) => p !== 'Tortie' && p !== 'Calico');
  const tints = spriteMapper.getTints();
  const eyeColours = spriteMapper.getEyeColours();
  const skinColours = spriteMapper.getSkinColours();
  const accessories = spriteMapper.getAccessories();
  const scars = spriteMapper.getScars();
  const points = spriteMapper.getPoints();
  const vitiligo = spriteMapper.getVitiligo();

  const params: CatParams = {
    spriteNumber,
    peltName: pickOne(pelts),
    colour: pickColour(),
    tint: pickOne(tints),
    skinColour: pickOne(skinColours),
    eyeColour: pickOne(eyeColours),
    shading: roll(RANDOM_CONFIG.probabilities.shading),
    reverse: roll(RANDOM_CONFIG.probabilities.reverse),
    isTortie: false,
  };
  const slotSelections: SlotSelections = {
    accessories: [],
    scars: [],
    tortie: [],
  };

  const exactLayerCounts = options.exactLayerCounts === true;
  const tortieConfig = RANDOM_CONFIG.counts.tortie;
  const tortieSlotCount = determineSlotCount('tortie', tortieConfig, RANDOM_CONFIG.defaultSlots, options);
  const usesExplicitTortieCount = hasExplicitSlotControl('tortie', options);
  if (exactLayerCounts || usesExplicitTortieCount) {
    params.isTortie = tortieSlotCount > 0;
  } else {
    params.isTortie = roll(RANDOM_CONFIG.probabilities.isTortie);
  }

  if (roll(RANDOM_CONFIG.probabilities.heterochromia)) {
    const heteroPool = ['', ...eyeColours];
    const selected = pickOne(heteroPool);
    if (selected) {
      params.eyeColour2 = selected;
    }
  }

  if (params.isTortie) {
    const slotCount = (exactLayerCounts || usesExplicitTortieCount)
      ? tortieSlotCount
      : Math.max(1, tortieSlotCount);
    const masks = spriteMapper.getTortieMasks();
    const uniqueMasks = tortieConfig.unique !== false;
    const layerProbability = RANDOM_CONFIG.probabilities.tortieLayer ?? RANDOM_CONFIG.probabilities.isTortie ?? 0.5;
    const tortieResult = materializeTortieSlots({
      slotCount,
      masks,
      pelts,
      pickColour,
      uniqueMasks,
      exactCount: exactLayerCounts,
      shouldFillSlot: (slotIndex) => slotIndex === 0 || roll(layerProbability),
    });

    if (!exactLayerCounts && !usesExplicitTortieCount && tortieResult.selectedValues.length === 0 && masks.length > 0) {
      const fallback = materializeTortieSlots({
        slotCount: 1,
        masks,
        pelts,
        pickColour,
        uniqueMasks,
        exactCount: true,
        shouldFillSlot: () => true,
      });
      tortieResult.selectedValues.push(...fallback.selectedValues);
      tortieResult.slotSelections.push(...fallback.slotSelections);
    }

    slotSelections.tortie = tortieResult.slotSelections;

    if (tortieResult.selectedValues.length > 0) {
      params.tortie = tortieResult.selectedValues;
      params.tortieMask = tortieResult.selectedValues[0].mask;
      params.tortieColour = tortieResult.selectedValues[0].colour;
      params.tortiePattern = tortieResult.selectedValues[0].pattern;
    } else {
      params.isTortie = false;
    }
  }

  if (roll(RANDOM_CONFIG.probabilities.whitePatchGroup)) {
    if (roll(RANDOM_CONFIG.probabilities.whitePatch)) {
      const whitePatches = spriteMapper.getWhitePatches();
      if (whitePatches.length > 0) {
        params.whitePatches = pickOne(whitePatches);
      }
    }

    const tintMode = options.whitePatchColourMode ?? RANDOM_CONFIG.whitePatches.tintMode ?? 'default';
    const tintOptions = spriteMapper.getWhitePatchColourOptions(
      tintMode,
      params.isTortie ? experimentalMode : null
    );
    const filteredTints = RANDOM_CONFIG.whitePatches.allowNoneTint === false
      ? tintOptions.filter((value: string) => value !== 'none')
      : tintOptions;
    if (filteredTints.length > 0) {
      const candidate = pickOne(filteredTints);
      if (candidate && candidate !== 'none') {
        params.whitePatchesTint = candidate;
      }
    }

    if (roll(RANDOM_CONFIG.probabilities.points) && points.length > 0) {
      params.points = pickOne(points);
    }

    if (roll(RANDOM_CONFIG.probabilities.vitiligo) && vitiligo.length > 0) {
      params.vitiligo = pickOne(vitiligo);
    }
  }

  const accessoryConfig = RANDOM_CONFIG.counts.accessories;
  const accessorySlots = determineSlotCount('accessories', accessoryConfig, RANDOM_CONFIG.defaultSlots, options);
  if (accessorySlots > 0 && accessories.length > 0) {
    const uniqueAccessories = accessoryConfig.unique !== false;
    const accessoryProbability = RANDOM_CONFIG.probabilities.accessorySlot ?? RANDOM_CONFIG.probabilities.accessory ?? 0.5;
    const accessoryResult = materializeStringSlots({
      slotCount: accessorySlots,
      availableChoices: accessories,
      unique: uniqueAccessories,
      exactCount: exactLayerCounts,
      placeholder: 'none',
      shouldFillSlot: () => roll(accessoryProbability),
    });
    slotSelections.accessories = accessoryResult.slotSelections as string[];
    if (accessoryResult.selectedValues.length > 0) {
      params.accessories = accessoryResult.selectedValues;
      params.accessory = accessoryResult.selectedValues[0];
    }
  }

  const scarsConfig = RANDOM_CONFIG.counts.scars;
  const scarSlots = determineSlotCount('scars', scarsConfig, RANDOM_CONFIG.defaultSlots, options);
  if (scarSlots > 0 && scars.length > 0) {
    const uniqueScars = scarsConfig.unique !== false;
    const scarProbability = RANDOM_CONFIG.probabilities.scarSlot ?? RANDOM_CONFIG.probabilities.scar ?? 0.5;
    const scarResult = materializeStringSlots({
      slotCount: scarSlots,
      availableChoices: scars,
      unique: uniqueScars,
      exactCount: exactLayerCounts,
      placeholder: 'none',
      shouldFillSlot: () => roll(scarProbability),
    });
    slotSelections.scars = scarResult.slotSelections as string[];
    if (scarResult.selectedValues.length > 0) {
      params.scars = scarResult.selectedValues;
      params.scar = scarResult.selectedValues[0];
    }
  }

  return { params, slotSelections };
}

export async function generateRandomParamsV3(options: RandomGenerationOptions = {}): Promise<CatParams> {
  const result = await generateRandomParamsV3Detailed(options);
  return result.params;
}
