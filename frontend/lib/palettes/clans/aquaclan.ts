import type { PaletteCategory } from "../types";

export const aquaclanPalette: PaletteCategory = {
  id: "aquaclan",
  label: "AquaClan",
  description:
    "The bioluminescent deep — midnight-zone blues lit by glowing plankton, jellyfish violet, and anglerfish gold",
  colors: {
    AQC_MIDNIGHTZONE: { multiply: [4, 12, 28] },
    AQC_ABYSSAL: { multiply: [8, 24, 48] },
    AQC_DEEPWATER: { multiply: [14, 42, 76] },
    AQC_TWILIGHTBLUE: { multiply: [24, 64, 108] },
    AQC_CURRENTBLUE: { multiply: [36, 92, 142] },
    AQC_CLEARWATER: { multiply: [56, 128, 172] },
    AQC_KELPSHADOW: { multiply: [30, 80, 70] },
    AQC_BIOLUME: { multiply: [40, 230, 210] },
    AQC_GLOWCYAN: { multiply: [110, 245, 225] },
    AQC_PLANKTONLIGHT: { multiply: [180, 250, 235] },
    AQC_JELLYVIOLET: { multiply: [150, 110, 220] },
    AQC_JELLYGLOW: { multiply: [195, 160, 245] },
    AQC_ANGLERGOLD: { multiply: [250, 215, 120] },
    AQC_SEAFOAM: { multiply: [205, 238, 230] },
    AQC_PEARLABYSS: { multiply: [232, 244, 244] },
    AQC_GLOWWAVES: {
      pattern: {
        type: "seigaiha",
        tileSize: 9,
        background: [8, 24, 48],
        foreground: [40, 230, 210],
      },
    },
    AQC_JELLYBLOOM: {
      pattern: {
        type: "polkadot",
        tileSize: 8,
        background: [4, 12, 28],
        foreground: [150, 110, 220],
      },
    },
    AQC_PLANKTONSPARK: {
      pattern: {
        type: "kanoko",
        tileSize: 8,
        background: [14, 42, 76],
        foreground: [110, 245, 225],
      },
    },
    AQC_DEEPCURRENT: {
      pattern: {
        type: "tachiwaki",
        tileSize: 10,
        background: [4, 12, 28],
        foreground: [36, 92, 142],
      },
    },
    AQC_SCALESHIMMER: {
      pattern: {
        type: "shippo",
        tileSize: 9,
        background: [24, 64, 108],
        foreground: [110, 245, 225],
      },
    },
    AQC_RIPPLEGLASS: {
      pattern: {
        type: "gingham",
        tileSize: 8,
        background: [205, 238, 230],
        foreground: [36, 92, 142],
      },
    },
    AQC_TIDALWEAVE: {
      pattern: {
        type: "basketweave",
        tileSize: 8,
        background: [14, 42, 76],
        foreground: [56, 128, 172],
      },
    },
    AQC_LANTERNDOT: {
      pattern: {
        type: "polkadot",
        tileSize: 9,
        background: [8, 24, 48],
        foreground: [250, 215, 120],
      },
    },
    AQC_CORALMAZE: {
      pattern: {
        type: "greek_key",
        tileSize: 10,
        background: [4, 12, 28],
        foreground: [40, 230, 210],
      },
    },
    AQC_DIVESTRIPE: {
      pattern: {
        type: "diagonal",
        tileSize: 8,
        background: [8, 24, 48],
        foreground: [110, 245, 225],
      },
    },
  },
};
