import type { ExtendedMode } from "@/utils/singleCatVariants";

/**
 * Append-only palette registry for portable settings encoding (v1).
 *
 * Each entry's array index defines its **bit position** in the palette
 * bitmask.  **New palettes MUST only be appended — never reorder or
 * remove entries.**  This guarantees that existing codes always
 * decode to the same settings.
 *
 * "base" is NOT in this registry because it maps to the separate
 * `includeBaseColours` boolean, which has its own dedicated bit.
 *
 * Current capacity: 75 bit positions (96 total bits − 21 fixed).
 * Used: 70 / 75 palette positions, plus 1 reserved mode bit.
 * Spare: 4 palette slots + 1 reserved mode bit.
 */
export const PORTABLE_PALETTE_REGISTRY: readonly ExtendedMode[] = [
  // ── Core: Solid (positions 0–3) ──
  "mood",
  "bold",
  "darker",
  "blackout",
  // ── Core: Anime / Film (positions 4–13) ──
  "mononoke",
  "howl",
  "demonslayer",
  "titanic",
  "deathnote",
  "slime",
  "ghostintheshell",
  "mushishi",
  "chisweethome",
  "fma",
  // ── Pure / monochromatic solids (positions 14–36) ──
  "ocean-depths",
  "midnight-velvet",
  "arctic-waters",
  "emerald-forest",
  "jade-mist",
  "electric-grass",
  "golden-hour",
  "ember-glow",
  "crimson-flame",
  "rose-garden",
  "neon-blossom",
  "royal-amethyst",
  "twilight-haze",
  "espresso-bean",
  "desert-sand",
  "storm-cloud",
  "coral-reef",
  "tropical-lagoon",
  "midnight-wine",
  "peach-sorbet",
  "greyscale",
  "cold-steel",
  "ink-wash",
  // ── Textile (positions 37–54) ──
  "royal-stewart",
  "black-watch",
  "country-tweed",
  "savile-row",
  "bavarian-tracht",
  "oktoberfest",
  "tartan-patterns",
  "gingham-patterns",
  "houndstooth-patterns",
  "pinstripe-patterns",
  "chevron-patterns",
  "polkadot-patterns",
  "argyle-patterns",
  "buffalo-patterns",
  "checkerboard-patterns",
  "windowpane-patterns",
  "diagonal-patterns",
  "basketweave-patterns",
  // ── Ornate (positions 55–58) ──
  "european-ornate",
  "art-deco-patterns",
  "medieval-patterns",
  "famous-patterns",
  // ── Heritage (positions 59–68) ──
  "scottish-clans",
  "japanese-patterns",
  "middle-eastern-rugs",
  "indian-patterns",
  "chinese-patterns",
  "african-patterns",
  "indonesian-patterns",
  "korean-patterns",
  "scandinavian-patterns",
  "american-patterns",
  // ── Flags (position 69) ──
  "flag-patterns",
] as const; // 70 entries → positions 0–69
