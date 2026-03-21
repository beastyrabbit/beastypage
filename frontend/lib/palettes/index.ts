/**
 * Palette aggregator - single source of truth for all experimental color palettes
 */

import type { PaletteCategory, PaletteColorDef, FullPaletteColorDef, PaletteId, PaletteMode, PaletteGroup } from './types';
import { toFullColorDef } from './types';

// Base palettes
import { moodPalette } from './mood';
import { boldPalette } from './bold';
import { darkerPalette } from './darker';
import { blackoutPalette } from './blackout';

// New anime/film-inspired palettes
import { mononokePalette } from './mononoke';
import { howlPalette } from './howl';
import { demonslayerPalette } from './demonslayer';
import { titanicPalette } from './titanic';
import { deathnotePalette } from './deathnote';
import { slimePalette } from './slime';
import { ghostintheshellPalette } from './ghostintheshell';
import { mushishiPalette } from './mushishi';
import { chisweethomePalette } from './chisweethome';
import { fmaPalette } from './fma';

// Pure/monochromatic palettes
import { PURE_PALETTES } from './pure';

// Textile-inspired palettes
import { TEXTILE_PALETTES } from './textile';

/**
 * Assign a group to a palette without modifying the original definition.
 */
function withGroup(palette: PaletteCategory, group: PaletteGroup): PaletteCategory {
  return { ...palette, group };
}

/**
 * Group assignments — centralized so individual palette files don't need a `group` field.
 */
const SOLID_IDS = new Set<PaletteId>([
  'mood', 'bold', 'darker', 'blackout',
  // All pure/monochromatic palettes are also solid
  'ocean-depths', 'midnight-velvet', 'arctic-waters', 'emerald-forest',
  'jade-mist', 'electric-grass', 'golden-hour', 'ember-glow',
  'crimson-flame', 'rose-garden', 'neon-blossom', 'royal-amethyst',
  'twilight-haze', 'espresso-bean', 'desert-sand', 'storm-cloud',
  'coral-reef', 'tropical-lagoon', 'midnight-wine', 'peach-sorbet',
  'greyscale', 'cold-steel', 'ink-wash',
]);

const ANIME_IDS = new Set<PaletteId>([
  'mononoke', 'howl', 'demonslayer', 'titanic', 'deathnote',
  'slime', 'ghostintheshell', 'mushishi', 'chisweethome', 'fma',
]);

const TEXTILE_IDS = new Set<PaletteId>([
  'royal-stewart', 'black-watch', 'country-tweed', 'savile-row',
  'bavarian-tracht', 'oktoberfest',
  'tartan-patterns', 'gingham-patterns', 'houndstooth-patterns',
  'pinstripe-patterns', 'chevron-patterns', 'polkadot-patterns',
  'argyle-patterns', 'buffalo-patterns', 'checkerboard-patterns',
  'windowpane-patterns', 'diagonal-patterns', 'basketweave-patterns',
]);

const ORNATE_IDS = new Set<PaletteId>([
  'european-ornate', 'art-deco-patterns',
]);

const HERITAGE_IDS = new Set<PaletteId>([
  'scottish-clans', 'japanese-patterns', 'middle-eastern-rugs', 'indian-patterns',
  'chinese-patterns', 'african-patterns', 'indonesian-patterns', 'korean-patterns',
]);

const FLAG_IDS = new Set<PaletteId>(['flag-patterns']);

function inferGroup(id: PaletteId): PaletteGroup {
  if (SOLID_IDS.has(id)) return 'solid';
  if (ANIME_IDS.has(id)) return 'anime';
  if (TEXTILE_IDS.has(id)) return 'textile';
  if (ORNATE_IDS.has(id)) return 'ornate';
  if (HERITAGE_IDS.has(id)) return 'heritage';
  if (FLAG_IDS.has(id)) return 'flags';
  if (process.env.NODE_ENV === 'development') {
    console.warn(`[palettes] palette "${id}" has no group assignment — defaulting to 'solid'`);
  }
  return 'solid';
}

/**
 * All additional palettes in display order, with groups assigned.
 */
export const ADDITIONAL_PALETTES: PaletteCategory[] = [
  // Original palettes
  moodPalette,
  boldPalette,
  darkerPalette,
  blackoutPalette,
  // New anime/film-inspired palettes
  mononokePalette,
  howlPalette,
  demonslayerPalette,
  titanicPalette,
  deathnotePalette,
  slimePalette,
  ghostintheshellPalette,
  mushishiPalette,
  chisweethomePalette,
  fmaPalette,
  // Pure/monochromatic palettes
  ...PURE_PALETTES,
  // Textile-inspired palettes
  ...TEXTILE_PALETTES,
].map((p) => withGroup(p, inferGroup(p.id)));

/**
 * Map of palette ID to palette category for quick lookups
 */
export const PALETTES_BY_ID = Object.fromEntries(
  ADDITIONAL_PALETTES.map((p) => [p.id, p]),
) as Record<PaletteId, PaletteCategory>;

/**
 * Get all palette IDs
 */
export function getPaletteIds(): PaletteId[] {
  return ADDITIONAL_PALETTES.map((p) => p.id);
}

/**
 * Get all color definitions combined from all palettes (with baseColour for spriteMapper)
 */
export function getAllColorDefs(): Record<string, FullPaletteColorDef> {
  const result: Record<string, FullPaletteColorDef> = {};

  for (const palette of ADDITIONAL_PALETTES) {
    for (const [colorName, colorDef] of Object.entries(palette.colors)) {
      result[colorName] = toFullColorDef(colorDef);
    }
  }

  return result;
}

/**
 * Get color categories mapping (palette id -> array of color names)
 */
export function getAllCategories(): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  for (const palette of ADDITIONAL_PALETTES) {
    result[palette.id] = Object.keys(palette.colors);
  }

  return result;
}

/**
 * Get a specific palette by ID
 */
export function getPaletteById(id: PaletteId): PaletteCategory | undefined {
  return PALETTES_BY_ID[id];
}

/**
 * Get palette metadata (id, label, description) for all palettes
 */
export function getPaletteMetadata(): Array<{ id: PaletteId; label: string; description?: string }> {
  return ADDITIONAL_PALETTES.map((p) => ({
    id: p.id,
    label: p.label,
    description: p.description,
  }));
}

/**
 * Get colors for a specific palette (with baseColour for spriteMapper)
 */
export function getColorsForPalette(paletteId: PaletteId): Record<string, FullPaletteColorDef> {
  const palette = PALETTES_BY_ID[paletteId];
  if (!palette) return {};

  const result: Record<string, FullPaletteColorDef> = {};
  for (const [colorName, colorDef] of Object.entries(palette.colors)) {
    result[colorName] = toFullColorDef(colorDef);
  }
  return result;
}

/**
 * Get color names for a specific palette
 */
export function getColorNamesForPalette(paletteId: PaletteId): string[] {
  const palette = PALETTES_BY_ID[paletteId];
  return palette ? Object.keys(palette.colors) : [];
}

/**
 * Get a color definition by name (with baseColour for spriteMapper)
 */
export function getColorDef(colorName: string): FullPaletteColorDef | null {
  const upper = colorName.toUpperCase();
  for (const palette of ADDITIONAL_PALETTES) {
    const def = palette.colors[upper];
    if (def) {
      return toFullColorDef(def);
    }
  }
  return null;
}

/**
 * Check if a color name is an experimental/additional color
 */
export function isExperimentalColor(colorName: string): boolean {
  const upper = colorName.toUpperCase();
  return ADDITIONAL_PALETTES.some((palette) => upper in palette.colors);
}

/**
 * Get palettes filtered by group
 */
export function getPalettesByGroup(group: PaletteGroup): PaletteCategory[] {
  return ADDITIONAL_PALETTES.filter((p) => p.group === group);
}

// Re-export types and utilities
export type { PaletteCategory, PaletteColorDef, FullPaletteColorDef, PaletteId, PaletteMode, PaletteGroup };
export type { PatternDefinition, PatternStripe } from './types';
export { patternToCssBackground } from './pattern-css';
