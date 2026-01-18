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

export interface PaletteCategory {
  id: string;
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
  | 'fma';
