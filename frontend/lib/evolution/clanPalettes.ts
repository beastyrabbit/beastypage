import { getAllCategories, type PaletteId } from "@/lib/palettes";
import type { EvolutionArchetype } from "./evolutionGenerator";

/**
 * Every supported colour palette assigned to exactly one clan.
 *
 * The six controlled clans (flare, aqua, leaf, sun, rose, moon) are
 * hue-coherent: they only roll colours from their own palettes. The four
 * wild clans (volt, crystal, void, steel) own the eclectic collections and
 * additionally have a chance to roll from the entire colour pool.
 */
export const CLAN_PALETTES: Record<EvolutionArchetype, PaletteId[]> = {
  // ── controlled ──────────────────────────────────────────────────────
  flare: [
    "flareclan",
    "crimson-flame",
    "ember-glow",
    "demonslayer",
    "fma",
    "royal-stewart",
    "buffalo-patterns",
    "chinese-patterns",
  ],
  aqua: [
    "aquaclan",
    "ocean-depths",
    "arctic-waters",
    "tropical-lagoon",
    "titanic",
    "slime",
    "bavarian-tracht",
    "scandinavian-patterns",
  ],
  leaf: [
    "leafclan",
    "emerald-forest",
    "jade-mist",
    "mononoke",
    "mushishi",
    "espresso-bean",
    "country-tweed",
    "black-watch",
    "tartan-patterns",
  ],
  sun: [
    "sunclan",
    "golden-hour",
    "desert-sand",
    "peach-sorbet",
    "chisweethome",
    "oktoberfest",
    "indian-patterns",
    "african-patterns",
  ],
  rose: [
    "roseclan",
    "rose-garden",
    "coral-reef",
    "neon-blossom",
    "japanese-patterns",
    "polkadot-patterns",
    "gingham-patterns",
  ],
  moon: [
    "moonclan",
    "greyscale",
    "storm-cloud",
    "ink-wash",
    "pinstripe-patterns",
    "houndstooth-patterns",
    "checkerboard-patterns",
    "windowpane-patterns",
  ],
  // ── wild ────────────────────────────────────────────────────────────
  volt: [
    "voltclan",
    "electric-grass",
    "bold",
    "chevron-patterns",
    "diagonal-patterns",
    "art-deco-patterns",
    "famous-patterns",
  ],
  crystal: [
    "crystalclan",
    "mood",
    "howl",
    "royal-amethyst",
    "twilight-haze",
    "european-ornate",
    "argyle-patterns",
    "korean-patterns",
    "indonesian-patterns",
  ],
  void: [
    "voidclan",
    "blackout",
    "darker",
    "deathnote",
    "midnight-velvet",
    "midnight-wine",
    "medieval-patterns",
  ],
  steel: [
    "steelclan",
    "cold-steel",
    "ghostintheshell",
    "savile-row",
    "basketweave-patterns",
    "middle-eastern-rugs",
    "scottish-clans",
    "flag-patterns",
    "american-patterns",
  ],
};

/** Colour names per clan, resolved from the palette assignment. */
export function buildClanColourSets(): Record<EvolutionArchetype, string[]> {
  const categories = getAllCategories();
  return Object.fromEntries(
    Object.entries(CLAN_PALETTES).map(([clan, paletteIds]) => [
      clan,
      paletteIds.flatMap((paletteId) => categories[paletteId] ?? []),
    ]),
  ) as Record<EvolutionArchetype, string[]>;
}
