/**
 * Palette aggregator - single source of truth for all experimental color palettes
 */

import type { PaletteCategory, PaletteColorDef, FullPaletteColorDef, PaletteId } from './types';
import { toFullColorDef } from './types';

// Existing palettes
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

/**
 * All additional palettes in display order
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
];

/**
 * Map of palette ID to palette category for quick lookups
 */
export const PALETTES_BY_ID: Record<PaletteId, PaletteCategory> = {
  mood: moodPalette,
  bold: boldPalette,
  darker: darkerPalette,
  blackout: blackoutPalette,
  mononoke: mononokePalette,
  howl: howlPalette,
  demonslayer: demonslayerPalette,
  titanic: titanicPalette,
  deathnote: deathnotePalette,
  slime: slimePalette,
  ghostintheshell: ghostintheshellPalette,
  mushishi: mushishiPalette,
  chisweethome: chisweethomePalette,
  fma: fmaPalette,
};

/**
 * Get all palette IDs
 */
export function getPaletteIds(): PaletteId[] {
  return ADDITIONAL_PALETTES.map((p) => p.id as PaletteId);
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
    id: p.id as PaletteId,
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

// Re-export types
export type { PaletteCategory, PaletteColorDef, FullPaletteColorDef, PaletteId };
