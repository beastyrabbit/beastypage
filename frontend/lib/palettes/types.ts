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
  type:
    | 'tartan' | 'gingham' | 'houndstooth' | 'pinstripe' | 'chevron'
    | 'polkadot' | 'argyle' | 'buffalo' | 'checkerboard' | 'windowpane'
    | 'diagonal' | 'basketweave' | 'flag'
    // SVG emblem flags
    | 'flag_canada' | 'flag_switzerland' | 'flag_uk' | 'flag_turkey' | 'flag_israel'
    | 'flag_scotland' | 'flag_jamaica' | 'flag_china' | 'flag_australia'
    // Phase 1: World patterns
    | 'seigaiha' | 'asanoha' | 'shippo' | 'islamic_star' | 'fleur_de_lis'
    | 'paisley' | 'greek_key' | 'art_deco_fan' | 'uroko' | 'eight_point_star'
    // Phase 2: East Asian + African + Indian
    | 'kikko' | 'sayagata' | 'chinese_lattice' | 'chinese_coin' | 'ruyi_cloud'
    | 'dancheong' | 'batik_kawung' | 'batik_parang' | 'karakusa' | 'kolam'
    | 'kente' | 'mudcloth' | 'adinkra' | 'shweshwe';
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
export interface FullPaletteColorDef extends PaletteColorDef {
  baseColour: 'WHITE';
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
  | 'flag-patterns'
  | 'scottish-clans'
  | 'japanese-patterns'
  | 'middle-eastern-rugs'
  // Phase 1: New cultural palettes
  | 'european-ornate'
  | 'art-deco-patterns'
  | 'indian-patterns'
  // Phase 2: Cultural palettes
  | 'chinese-patterns'
  | 'african-patterns'
  | 'indonesian-patterns'
  | 'korean-patterns';

/**
 * PaletteMode is 'off' (classic/original colours) or a specific palette ID
 */
export type PaletteMode = 'off' | PaletteId;

export type PaletteGroup = 'solid' | 'anime' | 'textile' | 'ornate' | 'heritage' | 'flags';

export interface PaletteCategory {
  id: PaletteId;
  label: string;
  description?: string;
  group?: PaletteGroup;
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
