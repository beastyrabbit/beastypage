import type { PaletteCategory } from "../types";

export const voltclanPalette: PaletteCategory = {
  id: "voltclan",
  label: "VoltClan",
  description:
    "Signature palette of VoltClan — storm blackout split by neon lime, lightning gold, plasma cyan, and surge magenta",
  colors: {
    VTC_BLACKOUT: { multiply: [12, 14, 10] },
    VTC_STORMNIGHT: { multiply: [30, 34, 26] },
    VTC_THUNDERGREY: { multiply: [90, 100, 105] },
    VTC_VOLTOLIVE: { multiply: [70, 84, 20] },
    VTC_CHARGEGREEN: { multiply: [104, 140, 24] },
    VTC_VOLTGREEN: { multiply: [140, 190, 30] },
    VTC_NEONLIME: { multiply: [176, 225, 40] },
    VTC_ELECTRICLIME: { multiply: [205, 245, 60] },
    VTC_FLASHYELLOW: { multiply: [235, 250, 90] },
    VTC_SPARKYELLOW: { multiply: [250, 240, 70] },
    VTC_LIGHTNINGGOLD: { multiply: [255, 220, 50] },
    VTC_CURRENTTEAL: { multiply: [40, 200, 180] },
    VTC_PLASMACYAN: { multiply: [70, 220, 230] },
    VTC_ELECTRICBLUE: { multiply: [50, 170, 240] },
    VTC_IONBLUE: { multiply: [80, 130, 250] },
    VTC_PLASMAVIOLET: { multiply: [150, 90, 240] },
    VTC_NEONMAGENTA: { multiply: [220, 70, 220] },
    VTC_SURGEPINK: { multiply: [250, 90, 170] },
    VTC_OZONEPALE: { multiply: [210, 240, 220] },
    VTC_STATICWHITE: { multiply: [240, 250, 240] },
    VTC_BOLTCHEVRON: {
      pattern: {
        type: "chevron",
        tileSize: 10,
        background: [12, 14, 10],
        foreground: [255, 220, 50],
        spacing: 2,
      },
    },
    VTC_CIRCUITPANE: {
      pattern: {
        type: "windowpane",
        tileSize: 9,
        background: [30, 34, 26],
        foreground: [70, 220, 230],
      },
    },
    VTC_STATICDOT: {
      pattern: {
        type: "polkadot",
        tileSize: 6,
        background: [70, 84, 20],
        foreground: [205, 245, 60],
      },
    },
    VTC_SURGESTRIPE: {
      pattern: {
        type: "diagonal",
        tileSize: 8,
        background: [12, 14, 10],
        foreground: [220, 70, 220],
      },
    },
    VTC_PLASMACHECK: {
      pattern: {
        type: "buffalo",
        tileSize: 8,
        background: [140, 190, 30],
        foreground: [12, 14, 10],
      },
    },
  },
};
