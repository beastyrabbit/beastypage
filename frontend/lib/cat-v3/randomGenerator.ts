import type { CatParams, TortieLayer, RandomGenerationOptions } from './types';
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

function drawUnique<T>(available: T[]): T | null {
  if (!available.length) return null;
  const index = Math.floor(Math.random() * available.length);
  const [item] = available.splice(index, 1);
  return item ?? null;
}

export async function generateRandomParamsV3(options: RandomGenerationOptions = {}): Promise<CatParams> {
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
  const baseColours = spriteMapper.getColourOptions(experimentalMode);
  let colours = baseColours;
  if (options.includeBaseColours === false) {
    const baseSet = new Set(spriteMapper.getColours().map((value: string) => value.toUpperCase()));
    const filtered = baseColours.filter((value: string) => !baseSet.has(value.toUpperCase()));
    if (filtered.length > 0) {
      colours = filtered;
    }
  }

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
    colour: pickOne(colours),
    tint: pickOne(tints),
    skinColour: pickOne(skinColours),
    eyeColour: pickOne(eyeColours),
    shading: roll(RANDOM_CONFIG.probabilities.shading),
    reverse: roll(RANDOM_CONFIG.probabilities.reverse),
    isTortie: false,
  };

  if (roll(RANDOM_CONFIG.probabilities.isTortie)) {
    params.isTortie = true;
  } else {
    params.isTortie = false;
  }

  if (roll(RANDOM_CONFIG.probabilities.heterochromia)) {
    const heteroPool = ['', ...eyeColours];
    const selected = pickOne(heteroPool);
    if (selected) {
      params.eyeColour2 = selected;
    }
  }

  if (params.isTortie) {
    const tortieConfig = RANDOM_CONFIG.counts.tortie;
    const slotCount = Math.max(
      1,
      determineSlotCount('tortie', tortieConfig, RANDOM_CONFIG.defaultSlots, options)
    );
    const masks = spriteMapper.getTortieMasks();
    const uniqueMasks = tortieConfig.unique !== false;
    const availableMasks = uniqueMasks ? [...masks] : masks;
    const layerProbability = RANDOM_CONFIG.probabilities.tortieLayer ?? RANDOM_CONFIG.probabilities.isTortie ?? 0.5;
    const tortiePatterns: TortieLayer[] = [];

    for (let slot = 0; slot < slotCount; slot += 1) {
      const shouldAdd = slot === 0 || roll(layerProbability);
      if (!shouldAdd) continue;
      const mask = uniqueMasks ? drawUnique(availableMasks) : pickOne(availableMasks);
      if (!mask) break;
      tortiePatterns.push({
        mask,
        pattern: pickOne(pelts),
        colour: pickOne(colours),
      });
      if (uniqueMasks && !availableMasks.length) {
        break;
      }
    }

    if (tortiePatterns.length === 0) {
      const fallbackMask = uniqueMasks ? drawUnique(availableMasks.length ? availableMasks : [...masks]) : pickOne(masks);
      if (fallbackMask) {
        tortiePatterns.push({
          mask: fallbackMask,
          pattern: pickOne(pelts),
          colour: pickOne(colours),
        });
      }
    }

    if (tortiePatterns.length > 0) {
      params.tortie = tortiePatterns;
      params.tortieMask = tortiePatterns[0].mask;
      params.tortieColour = tortiePatterns[0].colour;
      params.tortiePattern = tortiePatterns[0].pattern;
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
    const availableAccessories = uniqueAccessories ? [...accessories] : accessories;
    const accessoryProbability = RANDOM_CONFIG.probabilities.accessorySlot ?? RANDOM_CONFIG.probabilities.accessory ?? 0.5;
    const selectedAccessories: string[] = [];
    for (let slot = 0; slot < accessorySlots; slot += 1) {
      if (!roll(accessoryProbability)) continue;
      const choice = uniqueAccessories ? drawUnique(availableAccessories) : pickOne(availableAccessories);
      if (!choice) break;
      selectedAccessories.push(choice);
      if (uniqueAccessories && !availableAccessories.length) {
        break;
      }
    }
    if (selectedAccessories.length > 0) {
      params.accessories = selectedAccessories;
      params.accessory = selectedAccessories[0];
    }
  }

  const scarsConfig = RANDOM_CONFIG.counts.scars;
  const scarSlots = determineSlotCount('scars', scarsConfig, RANDOM_CONFIG.defaultSlots, options);
  if (scarSlots > 0 && scars.length > 0) {
    const uniqueScars = scarsConfig.unique !== false;
    const availableScars = uniqueScars ? [...scars] : scars;
    const scarProbability = RANDOM_CONFIG.probabilities.scarSlot ?? RANDOM_CONFIG.probabilities.scar ?? 0.5;
    const selectedScars: string[] = [];
    for (let slot = 0; slot < scarSlots; slot += 1) {
      if (!roll(scarProbability)) continue;
      const choice = uniqueScars ? drawUnique(availableScars) : pickOne(availableScars);
      if (!choice) break;
      selectedScars.push(choice);
      if (uniqueScars && !availableScars.length) {
        break;
      }
    }
    if (selectedScars.length > 0) {
      params.scars = selectedScars;
      params.scar = selectedScars[0];
    }
  }

  return params;
}
