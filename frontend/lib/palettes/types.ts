/**
 * Shared types for palette definitions
 *
 * All experimental colors are applied on WHITE base sprites using multiply/screen blend modes.
 * The baseColour is always WHITE so it's not stored in individual definitions.
 * Colors with a `pattern` field use per-pixel pattern tiles instead of flat multiply.
 */

export interface PatternStripe {
  color: [number, number, number];
  width: number;
  offset: number;
}

export interface PatternDefinition {
  type: 'tartan' | 'gingham' | 'houndstooth' | 'pinstripe' | 'chevron' | 'polkadot' | 'argyle' | 'buffalo' | 'checkerboard' | 'windowpane' | 'diagonal' | 'basketweave' | 'flag';
  tileSize: number;
  background: [number, number, number];
  foreground?: [number, number, number];
  stripes?: PatternStripe[];
  spacing?: number;
}

export interface PaletteColorDef {
  multiply?: [number, number, number];
  screen?: [number, number, number, number];
  pattern?: PatternDefinition;
}

/**
 * Full color definition with baseColour for spriteMapper compatibility
 */
export interface FullPaletteColorDef {
  baseColour: 'WHITE';
  multiply?: [number, number, number];
  screen?: [number, number, number, number];
  pattern?: PatternDefinition;
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
  | 'peach-sorbet'
  | 'greyscale'
  | 'cold-steel'
  | 'ink-wash'
  // Textile-inspired palettes
  | 'royal-stewart'
  | 'black-watch'
  | 'country-tweed'
  | 'savile-row'
  | 'bavarian-tracht'
  | 'oktoberfest'
  // Pattern palettes
  | 'tartan-patterns'
  | 'gingham-patterns'
  | 'houndstooth-patterns'
  | 'pinstripe-patterns'
  | 'chevron-patterns'
  | 'polkadot-patterns'
  | 'argyle-patterns'
  | 'buffalo-patterns'
  | 'checkerboard-patterns'
  | 'windowpane-patterns'
  | 'diagonal-patterns'
  | 'basketweave-patterns'
  | 'flag-patterns';

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
