import type { PaletteCategory } from "../types";

export const voidclanPalette: PaletteCategory = {
  id: "voidclan",
  label: "VoidClan",
  description:
    "The eldritch rift — true void and umbral purple torn by eerie green glow, cursed crimson, and watching eyes",
  colors: {
    VDC_TRUEVOID: { multiply: [6, 4, 10] },
    VDC_RIFTBLACK: { multiply: [14, 10, 22] },
    VDC_DARKBELOW: { multiply: [24, 18, 38] },
    VDC_UMBRA: { multiply: [38, 28, 58] },
    VDC_RIFTPURPLE: { multiply: [60, 40, 95] },
    VDC_ELDRITCHVIOLET: { multiply: [95, 60, 150] },
    VDC_WITCHGLOW: { multiply: [140, 95, 200] },
    VDC_ABYSSTEAL: { multiply: [25, 55, 65] },
    VDC_GHASTGREEN: { multiply: [55, 110, 80] },
    VDC_ELDRITCHGREEN: { multiply: [60, 180, 110] },
    VDC_SPECTRALMINT: { multiply: [140, 230, 180] },
    VDC_BLOODECLIPSE: { multiply: [85, 18, 35] },
    VDC_CURSEDCRIMSON: { multiply: [140, 30, 55] },
    VDC_BONEGREY: { multiply: [185, 180, 170] },
    VDC_PALEWRAITH: { multiply: [215, 215, 225] },
    VDC_RIFTSLASH: {
      pattern: {
        type: "diagonal",
        tileSize: 8,
        background: [6, 4, 10],
        foreground: [95, 60, 150],
      },
    },
    VDC_ELDRITCHEYES: {
      pattern: {
        type: "kanoko",
        tileSize: 8,
        background: [14, 10, 22],
        foreground: [60, 180, 110],
      },
    },
    VDC_NIGHTKNOT: {
      pattern: {
        type: "celtic_knot",
        tileSize: 11,
        background: [6, 4, 10],
        foreground: [60, 40, 95],
      },
    },
    VDC_VOIDCAMO: {
      pattern: {
        type: "camouflage",
        tileSize: 12,
        background: [14, 10, 22],
        foreground: [38, 28, 58],
      },
    },
    VDC_CURSEDDAMASK: {
      pattern: {
        type: "damask",
        tileSize: 12,
        background: [6, 4, 10],
        foreground: [85, 18, 35],
      },
    },
    VDC_SPIRITDOT: {
      pattern: {
        type: "polkadot",
        tileSize: 8,
        background: [14, 10, 22],
        foreground: [140, 230, 180],
      },
    },
    VDC_OMENSTAR: {
      pattern: {
        type: "eight_point_star",
        tileSize: 11,
        background: [6, 4, 10],
        foreground: [140, 95, 200],
      },
    },
    VDC_HEXLATTICE: {
      pattern: {
        type: "bishamon_kikko",
        tileSize: 10,
        background: [14, 10, 22],
        foreground: [60, 40, 95],
      },
    },
    VDC_PHANTOMSTRIPE: {
      pattern: {
        type: "pinstripe",
        tileSize: 8,
        background: [14, 10, 22],
        foreground: [185, 180, 170],
      },
    },
    VDC_RUNECHECK: {
      pattern: {
        type: "checkerboard",
        tileSize: 8,
        background: [6, 4, 10],
        foreground: [25, 55, 65],
      },
    },
  },
};
