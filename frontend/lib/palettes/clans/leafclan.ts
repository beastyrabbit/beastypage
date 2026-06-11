import type { PaletteCategory } from "../types";

export const leafclanPalette: PaletteCategory = {
  id: "leafclan",
  label: "LeafClan",
  description:
    "Ancient forest spirits — deep grove greens and wild bark, lit by fireflies, pale kodama, and toadstool red",
  colors: {
    LFC_FORESTFLOOR: { multiply: [20, 16, 10] },
    LFC_DARKBARK: { multiply: [44, 32, 20] },
    LFC_WILDROOT: { multiply: [76, 54, 32] },
    LFC_MUSHROOMTAN: { multiply: [142, 108, 72] },
    LFC_SPIRITNIGHT: { multiply: [14, 30, 20] },
    LFC_DEEPGROVE: { multiply: [26, 52, 32] },
    LFC_WILDMOSS: { multiply: [52, 88, 46] },
    LFC_FERNGREEN: { multiply: [86, 124, 58] },
    LFC_NEWGROWTH: { multiply: [128, 164, 80] },
    LFC_KODAMAPALE: { multiply: [196, 220, 170] },
    LFC_SPOREGLOW: { multiply: [225, 240, 150] },
    LFC_FIREFLYGOLD: { multiply: [245, 215, 95] },
    LFC_TOADSTOOLRED: { multiply: [188, 52, 38] },
    LFC_BERRYDARK: { multiply: [120, 30, 40] },
    LFC_MISTGREY: { multiply: [170, 184, 168] },
    LFC_HEMPLEAF: {
      pattern: {
        type: "asanoha",
        tileSize: 10,
        background: [26, 52, 32],
        foreground: [128, 164, 80],
      },
    },
    LFC_FIREFLYNIGHT: {
      pattern: {
        type: "polkadot",
        tileSize: 8,
        background: [14, 30, 20],
        foreground: [245, 215, 95],
      },
    },
    LFC_KODAMADOTS: {
      pattern: {
        type: "kanoko",
        tileSize: 8,
        background: [26, 52, 32],
        foreground: [196, 220, 170],
      },
    },
    LFC_VINESCROLL: {
      pattern: {
        type: "karakusa",
        tileSize: 11,
        background: [20, 16, 10],
        foreground: [86, 124, 58],
      },
    },
    LFC_TOADSTOOLDOT: {
      pattern: {
        type: "polkadot",
        tileSize: 7,
        background: [188, 52, 38],
        foreground: [236, 230, 215],
      },
    },
    LFC_WILDTRELLIS: {
      pattern: {
        type: "trellis",
        tileSize: 9,
        background: [196, 220, 170],
        foreground: [44, 32, 20],
      },
    },
    LFC_ROOTWEAVE: {
      pattern: {
        type: "basketweave",
        tileSize: 8,
        background: [44, 32, 20],
        foreground: [86, 124, 58],
      },
    },
    LFC_LEAFVEIN: {
      pattern: {
        type: "herringbone",
        tileSize: 8,
        background: [52, 88, 46],
        foreground: [128, 164, 80],
      },
    },
    LFC_GROVETARTAN: {
      pattern: {
        type: "tartan",
        tileSize: 10,
        background: [26, 52, 32],
        stripes: [
          { color: [142, 108, 72], width: 2, offset: 0 },
          { color: [245, 215, 95], width: 1, offset: 5 },
        ],
      },
    },
    LFC_SPIRITSNOW: {
      pattern: {
        type: "nordic_snowflake",
        tileSize: 11,
        background: [14, 30, 20],
        foreground: [196, 220, 170],
      },
    },
  },
};
