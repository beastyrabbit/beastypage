import type { SpriteMapperApi } from "@/components/cat-builder/types";
import { getColourSwatch } from "@/components/cat-builder/utils";
import { getColorDef } from "@/lib/palettes";
import type { ParamId } from "../spinSupport";

type Rgb = readonly [number, number, number];

const rgb = ([r, g, b]: Rgb) => `rgb(${r}, ${g}, ${b})`;

/** getColourSwatch's "unknown colour" result (also the real GREY swatch). */
const COLOUR_FALLBACK = "#94a3b8";

/** Multiply tints from public/sprite-data/tint.json (`tint_colours`). */
const TINT_COLOURS: Record<string, Rgb> = {
  pink: [253, 237, 237],
  gray: [225, 225, 225],
  red: [248, 226, 228],
  black: [195, 195, 195],
  orange: [255, 247, 235],
  yellow: [250, 248, 225],
  purple: [235, 225, 244],
  blue: [218, 237, 245],
};

/** spriteMapper.getWhitePatchesTintColor's table. */
const WHITE_PATCHES_TINT_COLOURS: Record<string, Rgb> = {
  darkcream: [236, 229, 208],
  cream: [247, 241, 225],
  offwhite: [238, 249, 252],
  gray: [208, 225, 229],
  pink: [254, 248, 249],
};

/** Eye colour → sprite group, from public/sprite-data/dicts/eye_sprite_data.json. */
const EYE_GROUP: Record<string, "yellow" | "green" | "blue"> = {
  YELLOW: "yellow",
  AMBER: "yellow",
  HAZEL: "green",
  PALEGREEN: "green",
  GREEN: "green",
  BLUE: "blue",
  DARKBLUE: "blue",
  GREY: "blue",
  CYAN: "blue",
  EMERALD: "green",
  HEATHERBLUE: "blue",
  SUNLITICE: "blue",
  COPPER: "yellow",
  SAGE: "green",
  COBALT: "blue",
  PALEBLUE: "blue",
  BRONZE: "yellow",
  SILVER: "yellow",
  PALEYELLOW: "yellow",
  GOLD: "yellow",
  GREENYELLOW: "yellow",
  ORANGE: "yellow",
  DAWN: "yellow",
  DUSK: "yellow",
  AURORA: "blue",
  FOREST: "green",
  MUSTARD: "yellow",
  EARTHY: "yellow",
  SEA: "blue",
  BLUEBELL: "blue",
};

const EYE_GROUP_COLOURS = {
  yellow: "#d9a441",
  green: "#5c9e4a",
  blue: "#4f8fd6",
} as const;

/** Hand-picked shades for common eye colours; the rest use their group. */
const EYE_OVERRIDES: Record<string, string> = {
  GREEN: "#5c9e4a",
  BLUE: "#4f8fd6",
  YELLOW: "#e3c03b",
  AMBER: "#d9902a",
  HAZEL: "#a8913f",
  COPPER: "#b8693a",
  EMERALD: "#2e9e6a",
  PALEBLUE: "#9cc3e8",
  DARKBLUE: "#2f5aa8",
  GREY: "#8f9aa3",
  CYAN: "#4fc4d6",
  PALEYELLOW: "#efe39a",
  GOLD: "#d9b13b",
  HEATHERBLUE: "#8e8fd0",
  SUNLITICE: "#b8e0ea",
};

/** Approximate skin (nose/paw pad) colours. */
const SKIN_COLOURS: Record<string, string> = {
  PINK: "#d99aa6",
  RED: "#b5563f",
  BLACK: "#1f1b1b",
  DARKBROWN: "#4a2f24",
  BROWN: "#6b4a37",
  LIGHTBROWN: "#a9815e",
  DARK: "#2a2a2a",
  DARKGREY: "#4d4d4d",
  GREY: "#8a8a8a",
  DARKSALMON: "#c46a5a",
  SALMON: "#e08a7a",
  PEACH: "#f0c0a0",
  DARKMARBLED: "#5a4a5a",
  MARBLED: "#8a7a8a",
  LIGHTMARBLED: "#bfb0bf",
  DARKBLUE: "#2f3f6a",
  BLUE: "#4f6fa0",
  LIGHTBLUE: "#8fb0d8",
};

function colourSwatch(
  name: string,
  mapper: SpriteMapperApi | null,
): string | null {
  const upper = name.toUpperCase();
  const swatch = getColourSwatch(upper, mapper);
  if (swatch !== COLOUR_FALLBACK || upper === "GREY") return swatch;
  const def = getColorDef(upper);
  if (def?.multiply) return rgb(def.multiply);
  // Pattern palettes have no flat colour; the tile background stands in.
  if (def?.pattern) return rgb(def.pattern.background);
  return null;
}

/**
 * Map a revealed trait value to a CSS colour for legends/swatches.
 * Returns null when the trait has no sensible colour (none, pose,
 * accessories, pattern-only traits…). Pure apart from the mapper lookup.
 */
export function swatchForParam(
  paramId: ParamId,
  raw: unknown,
  mapper: SpriteMapperApi | null,
): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  if (!name || name.toLowerCase() === "none") return null;

  switch (paramId) {
    case "colour":
    case "tortieColour":
      return colourSwatch(name, mapper);
    case "tint": {
      const tint = TINT_COLOURS[name.toLowerCase()];
      return tint ? rgb(tint) : null;
    }
    case "whitePatchesTint": {
      const tint = WHITE_PATCHES_TINT_COLOURS[name.toLowerCase()];
      return tint ? rgb(tint) : null;
    }
    case "eyeColour":
    case "eyeColour2": {
      const upper = name.toUpperCase();
      const group = EYE_GROUP[upper];
      return EYE_OVERRIDES[upper] ?? (group ? EYE_GROUP_COLOURS[group] : null);
    }
    case "skinColour":
      return SKIN_COLOURS[name.toUpperCase()] ?? null;
    default:
      return null;
  }
}

/** Deterministic pseudo-DMC thread code for the sampler legend ("318", "B5200"). */
export function dmcCode(paramId: ParamId, raw: unknown): string {
  const text = `${paramId}:${String(raw ?? "")}`.toUpperCase();
  if (text.endsWith(":WHITE")) return "B5200";
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return String(100 + (hash % 3800));
}
