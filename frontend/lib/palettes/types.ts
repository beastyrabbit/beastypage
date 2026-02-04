/**
 * Shared types for palette definitions
 *
 * All experimental colors are applied on WHITE base sprites using multiply/screen blend modes.
 * The baseColour is always WHITE so it's not stored in individual definitions.
 */

export interface PaletteColorDef {
  multiply: [number, number, number];
  screen?: [number, number, number, number];
}

/**
 * Full color definition with baseColour for spriteMapper compatibility
 */
export interface FullPaletteColorDef {
  baseColour: 'WHITE';
  multiply: [number, number, number];
  screen?: [number, number, number, number];
}

export type PaletteId =
  | 'mood'
  | 'bold'
  | 'darker'
  | 'blackout'
  | 'mononoke'
  | 'howl'
  | 'demonslayer'
  | 'titanic'
  | 'deathnote'
  | 'slime'
  | 'ghostintheshell'
  | 'mushishi'
  | 'chisweethome'
  | 'fma'
  // Pure/monochromatic palettes
  | 'ocean-depths'
  | 'midnight-velvet'
  | 'arctic-waters'
  | 'emerald-forest'
  | 'jade-mist'
  | 'electric-grass'
  | 'golden-hour'
  | 'ember-glow'
  | 'crimson-flame'
  | 'rose-garden'
  | 'neon-blossom'
  | 'royal-amethyst'
  | 'twilight-haze'
  | 'espresso-bean'
  | 'desert-sand'
  | 'storm-cloud'
  | 'coral-reef'
  | 'tropical-lagoon'
  | 'midnight-wine'
  | 'peach-sorbet';

/**
 * PaletteMode is 'off' (classic/original colours) or a specific palette ID
 */
export type PaletteMode = 'off' | PaletteId;

export interface PaletteCategory {
  id: PaletteId;
  label: string;
  description?: string;
  colors: Record<string, PaletteColorDef>;
}

/**
 * Convert a PaletteColorDef to FullPaletteColorDef for spriteMapper
 */
export function toFullColorDef(def: PaletteColorDef): FullPaletteColorDef {
  return {
    baseColour: 'WHITE',
    ...def,
  };
}
