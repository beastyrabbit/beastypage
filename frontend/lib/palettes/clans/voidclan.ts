import type { PaletteCategory } from "../types";

export const voidclanPalette: PaletteCategory = {
  id: "voidclan",
  label: "VoidClan",
  description:
    "Signature palette of VoidClan — absolute dark through umbral purples and abyss navy, lit by spectral ghost-glints",
  colors: {
    VDC_ABSOLUTEVOID: { multiply: [8, 6, 10] },
    VDC_NIGHTPITCH: { multiply: [16, 12, 20] },
    VDC_INKHEART: { multiply: [14, 18, 28] },
    VDC_OBSIDIAN: { multiply: [24, 26, 30] },
    VDC_ABYSSNAVY: { multiply: [20, 28, 46] },
    VDC_SHADOWPLUM: { multiply: [28, 18, 38] },
    VDC_DEEPECLIPSE: { multiply: [30, 42, 64] },
    VDC_DARKMATTER: { multiply: [40, 28, 54] },
    VDC_BLOODSHADE: { multiply: [50, 14, 22] },
    VDC_WITCHGREEN: { multiply: [26, 44, 36] },
    VDC_VOIDVIOLET: { multiply: [56, 38, 78] },
    VDC_PHANTOMGREY: { multiply: [60, 58, 70] },
    VDC_DARKCRIMSON: { multiply: [74, 20, 30] },
    VDC_UMBRALPURPLE: { multiply: [74, 50, 100] },
    VDC_DUSKSPECTRE: { multiply: [94, 68, 122] },
    VDC_WRAITHBLUE: { multiply: [95, 110, 145] },
    VDC_SPECTRALGLOW: { multiply: [120, 150, 140] },
    VDC_GHOSTVIOLET: { multiply: [140, 120, 170] },
    VDC_SOULEMBER: { multiply: [160, 90, 70] },
    VDC_PALESPIRIT: { multiply: [200, 200, 210] },
    VDC_GOTHICDAMASK: {
      pattern: {
        type: "damask",
        tileSize: 12,
        background: [16, 12, 20],
        foreground: [74, 50, 100],
      },
    },
    VDC_SHADOWCAMO: {
      pattern: {
        type: "camouflage",
        tileSize: 12,
        background: [24, 26, 30],
        foreground: [40, 28, 54],
      },
    },
    VDC_NIGHTKNOT: {
      pattern: {
        type: "celtic_knot",
        tileSize: 11,
        background: [8, 6, 10],
        foreground: [94, 68, 122],
      },
    },
    VDC_PHANTOMSTRIPE: {
      pattern: {
        type: "pinstripe",
        tileSize: 8,
        background: [16, 12, 20],
        foreground: [140, 120, 170],
      },
    },
    VDC_VOIDCHECKER: {
      pattern: {
        type: "checkerboard",
        tileSize: 8,
        background: [8, 6, 10],
        foreground: [30, 42, 64],
      },
    },
  },
};
