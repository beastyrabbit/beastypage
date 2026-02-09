/**
 * Server-side random cat parameter generation.
 *
 * Mirrors the browser-based `generateRandomParamsV3()` but loads sprite data
 * from disk instead of fetching over HTTP, making it suitable for Next.js API
 * routes and other Node.js contexts.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CatParams, TortieLayer, RandomGenerationOptions } from './types';
import config from './random-config.json';

// ---------------------------------------------------------------------------
// Config types (same as randomGenerator.ts)
// ---------------------------------------------------------------------------

type CountCategory = 'tortie' | 'accessories' | 'scars';
type CountStrategy = 'weighted' | 'uniform';

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

// ---------------------------------------------------------------------------
// Sprite data cache
// ---------------------------------------------------------------------------

interface SpriteData {
  readonly peltNames: readonly string[];
  readonly colours: readonly string[];
  readonly eyeColours: readonly string[];
  readonly skinColours: readonly string[];
  readonly accessories: readonly string[];
  readonly scars: readonly string[];
  readonly tortieMasks: readonly string[];
  readonly whitePatches: readonly string[];
  readonly points: readonly string[];
  readonly vitiligo: readonly string[];
  readonly tints: readonly string[];
  readonly whiteTints: readonly string[];
}

let cachedData: SpriteData | null = null;
let loadPromise: Promise<SpriteData> | null = null;

function resolvePublicPath(relativePath: string): string {
  // In both dev and standalone Docker builds, public/ is at ${cwd}/public.
  // Standalone: Dockerfile copies public/ to /app/public, WORKDIR is /app.
  // Dev: cwd is the frontend/ directory which contains public/.
  const root = process.env.NEXT_PUBLIC_DIR ?? path.join(process.cwd(), 'public');
  return path.join(root, relativePath);
}

async function loadSpriteData(): Promise<SpriteData> {
  if (cachedData) return cachedData;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const [indexRaw, peltRaw] = await Promise.all([
        readFile(resolvePublicPath('sprite-data/spritesIndex.json'), 'utf-8'),
        readFile(resolvePublicPath('sprite-data/peltInfo.json'), 'utf-8'),
      ]);

      const spritesIndex = JSON.parse(indexRaw) as Record<string, unknown>;
      const peltInfo = JSON.parse(peltRaw) as Record<string, string[]>;

      const data = extractLists(spritesIndex, peltInfo);
      cachedData = data;
      return data;
    } catch (error) {
      loadPromise = null; // Allow retry on next call
      throw error;
    }
  })();

  return loadPromise;
}

// ---------------------------------------------------------------------------
// List extraction (mirrors spriteMapper.js extractNamesFromIndex/PeltInfo)
// ---------------------------------------------------------------------------

function extractLists(
  spritesIndex: Record<string, unknown>,
  peltInfo: Record<string, string[]>,
): SpriteData {
  // --- Pelt names ---
  const patterns = [
    'single', 'tabby', 'marbled', 'rosette', 'smoke', 'ticked',
    'speckled', 'bengal', 'mackerel', 'classic', 'sokoke',
    'agouti', 'singlestripe', 'masked',
  ];
  const patternMap: Record<string, string> = {
    single: 'SingleColour', tabby: 'Tabby', marbled: 'Marbled',
    rosette: 'Rosette', smoke: 'Smoke', ticked: 'Ticked',
    speckled: 'Speckled', bengal: 'Bengal', mackerel: 'Mackerel',
    classic: 'Classic', sokoke: 'Sokoke', agouti: 'Agouti',
    singlestripe: 'Singlestripe', masked: 'Masked',
  };

  const peltPatterns = new Set<string>();
  for (const key of Object.keys(spritesIndex)) {
    for (const p of patterns) {
      if (key.startsWith(p)) peltPatterns.add(p);
    }
  }
  const peltNames = Array.from(peltPatterns)
    .map((p) => patternMap[p])
    .filter(Boolean) as string[];
  if (peltNames.includes('SingleColour') && !peltNames.includes('TwoColour')) {
    const idx = peltNames.indexOf('SingleColour');
    peltNames.splice(idx + 1, 0, 'TwoColour');
  }

  // --- Colours ---
  const colours = [
    'WHITE', 'PALEGREY', 'SILVER', 'GREY', 'DARKGREY', 'GHOST', 'BLACK',
    'CREAM', 'PALEGINGER', 'GOLDEN', 'GINGER', 'DARKGINGER', 'SIENNA',
    'LIGHTBROWN', 'LILAC', 'BROWN', 'GOLDEN-BROWN', 'DARKBROWN', 'CHOCOLATE',
  ];

  // --- Eye colours ---
  const eyeColours = [
    'YELLOW', 'AMBER', 'HAZEL', 'PALEGREEN', 'GREEN', 'BLUE', 'DARKBLUE',
    'GREY', 'CYAN', 'EMERALD', 'HEATHERBLUE', 'SUNLITICE', 'COPPER',
    'SAGE', 'COBALT', 'PALEBLUE', 'PALEYELLOW', 'GOLD', 'GREENYELLOW',
    'BRONZE', 'SILVER',
  ];

  // --- Skin colours ---
  const skinColors = new Set<string>();
  for (const key of Object.keys(spritesIndex)) {
    if (key.startsWith('skin') && key !== 'skin' && key !== 'skinparalyzed') {
      const color = key.replace('skin', '');
      if (color) skinColors.add(color);
    }
  }
  const skinColours = skinColors.size > 0
    ? Array.from(skinColors)
    : ['BLACK', 'PINK', 'DARKBROWN', 'BROWN', 'LIGHTBROWN', 'DARK', 'DARKGREY',
       'GREY', 'DARKSALMON', 'SALMON', 'PEACH', 'DARKMARBLED', 'MARBLED',
       'LIGHTMARBLED', 'DARKBLUE', 'BLUE', 'LIGHTBLUE', 'RED'];

  // --- Tortie masks ---
  const tortieMaskSet = new Set<string>();
  for (const key of Object.keys(spritesIndex)) {
    if (key.startsWith('tortiemask') && key !== 'tortiepatchesmasks') {
      const mask = key.replace('tortiemask', '');
      if (mask) tortieMaskSet.add(mask);
    }
  }
  const tortieMasks = tortieMaskSet.size > 0
    ? Array.from(tortieMaskSet)
    : ['ONE', 'TWO', 'THREE', 'FOUR', 'REDTAIL', 'DELILAH', 'MINIMALONE',
       'MINIMALTWO', 'MINIMALTHREE', 'MINIMALFOUR', 'HALF', 'OREO', 'SWOOP',
       'MOTTLED', 'SIDEMASK', 'EYEDOT', 'BANDANA', 'PACMAN', 'STREAMSTRIKE',
       'ORIOLE', 'CHIMERA', 'DAUB', 'EMBER', 'BLANKET', 'ROBIN', 'BRINDLE',
       'PAIGE', 'ROSETAIL', 'SAFI', 'SMUDGED', 'DAPPLENIGHT', 'STREAK', 'MASK',
       'CHEST', 'ARMTAIL', 'SMOKE', 'GRUMPYFACE', 'BRIE', 'BELOVED', 'BODY',
       'SHILOH', 'FRECKLED', 'HEARTBEAT'];

  // --- Points & vitiligo ---
  const points = ['COLOURPOINT', 'RAGDOLL', 'SEPIAPOINT', 'MINKPOINT', 'SEALPOINT'];
  const vitiligo = ['VITILIGO', 'VITILIGOTWO', 'MOON', 'PHANTOM', 'KARPATI', 'POWDER', 'BLEACHED', 'SMOKEY'];

  // --- White patches ---
  const whitePatchSet = new Set<string>();
  for (const key of Object.keys(spritesIndex)) {
    if (key.startsWith('white') && key !== 'whitepatches') {
      const patch = key.substring(5);
      if (patch) whitePatchSet.add(patch);
    }
  }
  const pointsSet = new Set(points);
  const vitiligoSet = new Set(vitiligo);
  const whitePatches = Array.from(whitePatchSet).filter(
    (p) => !pointsSet.has(p) && !vitiligoSet.has(p),
  );

  // --- Accessories ---
  const accessories: string[] = [];
  if (peltInfo.plant_accessories) accessories.push(...peltInfo.plant_accessories);
  if (peltInfo.wild_accessories) accessories.push(...peltInfo.wild_accessories);
  if (peltInfo.collars) accessories.push(...peltInfo.collars);
  if (peltInfo.extra_accessories) accessories.push(...peltInfo.extra_accessories);

  // --- Scars ---
  const scars: string[] = [];
  if (peltInfo.scars1) scars.push(...peltInfo.scars1);
  if (peltInfo.scars2) scars.push(...peltInfo.scars2);
  if (peltInfo.scars3) scars.push(...peltInfo.scars3);

  // --- Tints ---
  const tints = ['none', 'pink', 'gray', 'red', 'black', 'orange', 'yellow', 'purple', 'blue', 'dilute', 'warmdilute', 'cooldilute'];
  const whiteTints = ['none', 'darkcream', 'cream', 'offwhite', 'gray', 'pink'];

  return {
    peltNames, colours, eyeColours, skinColours,
    accessories, scars, tortieMasks, whitePatches,
    points, vitiligo, tints, whiteTints,
  };
}

// ---------------------------------------------------------------------------
// Pure random helpers (same as randomGenerator.ts)
// ---------------------------------------------------------------------------

function roll(probability: number | undefined): boolean {
  if (!probability || probability <= 0) return false;
  if (probability >= 1) return true;
  return Math.random() < probability;
}

function pickOne<T>(items: readonly T[]): T {
  if (!items.length) throw new Error('Attempted to pick from an empty list');
  return items[Math.floor(Math.random() * items.length)];
}

function weightedPick(values: Record<string, number>, fallback: () => number): number {
  const entries = Object.entries(values ?? {})
    .map(([key, weight]) => ({ value: Number(key), weight: Number(weight) }))
    .filter((e) => Number.isFinite(e.value) && Number.isFinite(e.weight) && e.weight > 0);
  if (!entries.length) return fallback();
  const total = entries.reduce((s, e) => s + e.weight, 0);
  const target = Math.random() * total;
  let running = 0;
  for (const entry of entries) {
    running += entry.weight;
    if (target <= running) return entry.value;
  }
  return entries[entries.length - 1].value;
}

function ensureArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function resolveCountsMode(
  category: CountCategory,
  override?: CountStrategy | Partial<Record<CountCategory, CountStrategy>>,
): CountStrategy {
  if (!override) return 'weighted';
  if (typeof override === 'string') return override;
  return override[category] ?? 'weighted';
}

function hasOverride(
  category: CountCategory,
  override?: CountStrategy | Partial<Record<CountCategory, CountStrategy>>,
): boolean {
  if (!override) return false;
  if (typeof override === 'string') return true;
  return override[category] !== undefined;
}

function resolveCount(category: CountCategory, mode: CountStrategy, cfg: CountConfig): number {
  const min = cfg.min ?? 0;
  const max = cfg.max ?? min;
  const clamp = (v: number) => Math.min(Math.max(v, min), max);
  if (min >= max) return min;
  if (mode === 'uniform') {
    const range = [];
    for (let i = min; i <= max; i++) range.push(i);
    return pickOne(range);
  }
  return clamp(weightedPick(cfg.weights ?? {}, () => {
    const range = [];
    for (let i = min; i <= max; i++) range.push(i);
    return pickOne(range);
  }));
}

function determineSlotCount(
  category: CountCategory,
  cfg: CountConfig,
  defaults: Record<string, number> | undefined,
  options: RandomGenerationOptions,
): number {
  if (options.slotOverrides?.[category] !== undefined) {
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
  const idx = Math.floor(Math.random() * available.length);
  const [item] = available.splice(idx, 1);
  return item ?? null;
}

// ---------------------------------------------------------------------------
// Discord-specific overrides
// ---------------------------------------------------------------------------

export interface DiscordCatOverrides {
  sprite?: number;
  pelt?: string;
  colour?: string;
  eyeColour?: string;
  shading?: boolean;
  accessories?: number;  // pin slot count 0-4
  scars?: number;        // pin slot count 0-3
  torties?: number;      // pin layer count 0-4; 0 = force no tortie
}

// ---------------------------------------------------------------------------
// Main generation function
// ---------------------------------------------------------------------------

// Random integer in [min, max] — mirrors computeLayerCount from single-cat-plus
function computeLayerCount(min: number, max: number): number {
  if (min >= max) return min;
  return min + Math.floor(Math.random() * (max - min + 1));
}

export async function generateRandomParamsServer(
  overrides: DiscordCatOverrides = {},
  options: RandomGenerationOptions = {},
): Promise<CatParams> {
  const data = await loadSpriteData();

  const spritePool = ensureArray(RANDOM_CONFIG.spritePool.include);
  if (!spritePool.length) throw new Error('Sprite pool is empty');

  const spriteNumber = overrides.sprite && spritePool.includes(overrides.sprite)
    ? overrides.sprite
    : pickOne(spritePool);

  const pelts = data.peltNames.filter((p) => p !== 'Tortie' && p !== 'Calico');

  // Afterlife: 10% chance (matching "dark10" default from single-cat-plus)
  const isDarkForest = Math.random() < 0.1;

  const params: CatParams = {
    spriteNumber,
    peltName: overrides.pelt && pelts.includes(overrides.pelt) ? overrides.pelt : pickOne(pelts),
    colour: overrides.colour && data.colours.includes(overrides.colour) ? overrides.colour : pickOne(data.colours),
    tint: pickOne(data.tints),
    skinColour: pickOne(data.skinColours),
    eyeColour: overrides.eyeColour && data.eyeColours.includes(overrides.eyeColour)
      ? overrides.eyeColour
      : pickOne(data.eyeColours),
    shading: overrides.shading ?? roll(RANDOM_CONFIG.probabilities.shading),
    reverse: roll(RANDOM_CONFIG.probabilities.reverse),
    isTortie: false,
    darkForest: isDarkForest,
    darkMode: isDarkForest,
  };

  // Heterochromia
  if (roll(RANDOM_CONFIG.probabilities.heterochromia)) {
    const pool = ['', ...data.eyeColours];
    const selected = pickOne(pool);
    if (selected) params.eyeColour2 = selected;
  }

  // Tortie — match single-cat-plus defaults (range 1-4)
  // When overrides.torties is provided: 0 = force no tortie, >0 = force tortie with that count
  // When omitted: 50% chance (per config) with random count 1-4
  const tortieCount = overrides.torties ?? undefined;
  if (tortieCount === 0) {
    params.isTortie = false;
  } else if (tortieCount !== undefined) {
    params.isTortie = true;
  } else {
    params.isTortie = roll(RANDOM_CONFIG.probabilities.isTortie);
  }

  if (params.isTortie) {
    const slotCount = tortieCount ?? computeLayerCount(1, 4);
    const tortieConfig = RANDOM_CONFIG.counts.tortie;
    const masks = data.tortieMasks;
    const uniqueMasks = tortieConfig.unique !== false;
    const availableMasks: string[] = [...masks];
    const layerProb = RANDOM_CONFIG.probabilities.tortieLayer ?? RANDOM_CONFIG.probabilities.isTortie ?? 0.5;
    const tortiePatterns: TortieLayer[] = [];

    for (let slot = 0; slot < slotCount; slot++) {
      const shouldAdd = slot === 0 || roll(layerProb);
      if (!shouldAdd) continue;
      const mask = uniqueMasks ? drawUnique(availableMasks) : pickOne(availableMasks);
      if (!mask) break;
      tortiePatterns.push({
        mask,
        pattern: pickOne(pelts),
        colour: pickOne(data.colours),
      });
      if (uniqueMasks && !availableMasks.length) break;
    }

    if (tortiePatterns.length === 0) {
      const fallback = uniqueMasks
        ? drawUnique(availableMasks.length ? availableMasks : [...masks] as string[])
        : pickOne(masks);
      if (fallback) {
        tortiePatterns.push({
          mask: fallback,
          pattern: pickOne(pelts),
          colour: pickOne(data.colours),
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

  // White patches
  if (roll(RANDOM_CONFIG.probabilities.whitePatchGroup)) {
    if (roll(RANDOM_CONFIG.probabilities.whitePatch) && data.whitePatches.length > 0) {
      params.whitePatches = pickOne(data.whitePatches);
    }

    const allowNone = RANDOM_CONFIG.whitePatches.allowNoneTint !== false;
    const filteredTints = allowNone ? data.whiteTints : data.whiteTints.filter((t) => t !== 'none');
    if (filteredTints.length > 0) {
      const candidate = pickOne(filteredTints);
      if (candidate && candidate !== 'none') params.whitePatchesTint = candidate;
    }

    if (roll(RANDOM_CONFIG.probabilities.points) && data.points.length > 0) {
      params.points = pickOne(data.points);
    }
    if (roll(RANDOM_CONFIG.probabilities.vitiligo) && data.vitiligo.length > 0) {
      params.vitiligo = pickOne(data.vitiligo);
    }
  }

  // Accessories — match single-cat-plus defaults (range 1-4)
  const accSlots = overrides.accessories ?? computeLayerCount(1, 4);
  if (accSlots > 0 && data.accessories.length > 0) {
    const accConfig = RANDOM_CONFIG.counts.accessories;
    const uniqueAcc = accConfig.unique !== false;
    const available: string[] = [...data.accessories];
    const accProb = RANDOM_CONFIG.probabilities.accessorySlot ?? RANDOM_CONFIG.probabilities.accessory ?? 0.5;
    const selected: string[] = [];
    for (let slot = 0; slot < accSlots; slot++) {
      if (!roll(accProb)) continue;
      const choice = uniqueAcc ? drawUnique(available) : pickOne(available);
      if (!choice) break;
      selected.push(choice);
      if (uniqueAcc && !available.length) break;
    }
    if (selected.length > 0) {
      params.accessories = selected;
      params.accessory = selected[0];
    }
  }

  // Scars — match single-cat-plus defaults (range 1-1, always 1 slot)
  const scarSlots = overrides.scars ?? computeLayerCount(1, 1);
  if (scarSlots > 0 && data.scars.length > 0) {
    const scarsConfig = RANDOM_CONFIG.counts.scars;
    const uniqueScars = scarsConfig.unique !== false;
    const available: string[] = [...data.scars];
    const scarProb = RANDOM_CONFIG.probabilities.scarSlot ?? RANDOM_CONFIG.probabilities.scar ?? 0.5;
    const selected: string[] = [];
    for (let slot = 0; slot < scarSlots; slot++) {
      if (!roll(scarProb)) continue;
      const choice = uniqueScars ? drawUnique(available) : pickOne(available);
      if (!choice) break;
      selected.push(choice);
      if (uniqueScars && !available.length) break;
    }
    if (selected.length > 0) {
      params.scars = selected;
      params.scar = selected[0];
    }
  }

  return params;
}
