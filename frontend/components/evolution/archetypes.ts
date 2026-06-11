import type { EvolutionArchetype } from "@/lib/evolution/evolutionGenerator";

export type ArchetypeTheme = {
  label: string;
  glyph: string;
  blurb: string;
  /** gradient start (bright) */
  from: string;
  /** gradient end (deep) */
  to: string;
};

export const STARTER_THEME: ArchetypeTheme = {
  label: "Origin",
  glyph: "🐾",
  blurb: "where every line begins",
  from: "#fbbf24",
  to: "#f97316",
};

export const ARCHETYPE_THEMES: Record<EvolutionArchetype, ArchetypeTheme> = {
  flare: {
    label: "Flare",
    glyph: "🔥",
    blurb: "the burning ember line",
    from: "#fb923c",
    to: "#ef4444",
  },
  aqua: {
    label: "Aqua",
    glyph: "💧",
    blurb: "the tidal current line",
    from: "#22d3ee",
    to: "#0284c7",
  },
  volt: {
    label: "Volt",
    glyph: "⚡",
    blurb: "the storm charge line",
    from: "#facc15",
    to: "#84cc16",
  },
  leaf: {
    label: "Leaf",
    glyph: "🌿",
    blurb: "the verdant growth line",
    from: "#4ade80",
    to: "#15803d",
  },
  moon: {
    label: "Moon",
    glyph: "🌙",
    blurb: "the silver night line",
    from: "#e2e8f0",
    to: "#64748b",
  },
  crystal: {
    label: "Crystal",
    glyph: "💎",
    blurb: "the prism facet line",
    from: "#93c5fd",
    to: "#8b5cf6",
  },
  rose: {
    label: "Rose",
    glyph: "🌹",
    blurb: "the wild bloom line",
    from: "#f472b6",
    to: "#e11d48",
  },
  steel: {
    label: "Steel",
    glyph: "⚙️",
    blurb: "the forged iron line",
    from: "#cbd5e1",
    to: "#475569",
  },
  void: {
    label: "Void",
    glyph: "🌑",
    blurb: "the deep dark line",
    from: "#a78bfa",
    to: "#312e81",
  },
  sun: {
    label: "Sun",
    glyph: "☀️",
    blurb: "the radiant dawn line",
    from: "#fde047",
    to: "#f59e0b",
  },
};

export function getArchetypeTheme(
  archetype: string | null | undefined,
): ArchetypeTheme {
  if (!archetype) return STARTER_THEME;
  return ARCHETYPE_THEMES[archetype as EvolutionArchetype] ?? STARTER_THEME;
}

/** hex (#rrggbb) -> rgba() string with the given alpha */
export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function archetypeGradient(theme: ArchetypeTheme): string {
  return `linear-gradient(135deg, ${theme.from}, ${theme.to})`;
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/**
 * Brighten a colour until its strongest channel reaches `floor`, so very
 * dark pelt colours (black, chocolate) still read as a visible glow.
 */
export function glowReady(
  rgb: [number, number, number],
  floor = 130,
): [number, number, number] {
  const max = Math.max(...rgb);
  if (max >= floor) return rgb;
  if (max === 0) return [floor, floor, floor];
  const scale = floor / max;
  return [rgb[0] * scale, rgb[1] * scale, rgb[2] * scale];
}
