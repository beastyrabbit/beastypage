import type { PaletteCategory } from "../types";

export const steelclanPalette: PaletteCategory = {
  id: "steelclan",
  label: "SteelClan",
  description:
    "The war forge — gunmetal and chrome struck with molten sparks, brass trim, patina, and war-banner red",
  colors: {
    STC_IRONBLACK: { multiply: [20, 22, 26] },
    STC_FORGESHADOW: { multiply: [40, 44, 50] },
    STC_GUNMETAL: { multiply: [62, 68, 76] },
    STC_COLDIRON: { multiply: [90, 98, 108] },
    STC_STEELPLATE: { multiply: [122, 130, 140] },
    STC_BRUSHEDSTEEL: { multiply: [158, 166, 176] },
    STC_POLISHEDCHROME: { multiply: [205, 212, 220] },
    STC_MIRRORSTEEL: { multiply: [238, 242, 246] },
    STC_FORGEFIRE: { multiply: [235, 120, 45] },
    STC_MOLTENGOLD: { multiply: [250, 180, 70] },
    STC_SPARKWHITE: { multiply: [255, 235, 180] },
    STC_WARBANNER: { multiply: [165, 30, 38] },
    STC_BLOODIRON: { multiply: [110, 25, 30] },
    STC_BRASSTRIM: { multiply: [195, 155, 80] },
    STC_PATINATEAL: { multiply: [85, 150, 140] },
    STC_CHAINMAIL: {
      pattern: {
        type: "chainmail",
        tileSize: 8,
        background: [40, 44, 50],
        foreground: [158, 166, 176],
      },
    },
    STC_DAMASCUSWAVE: {
      pattern: {
        type: "tachiwaki",
        tileSize: 10,
        background: [62, 68, 76],
        foreground: [158, 166, 176],
      },
    },
    STC_WARCHECK: {
      pattern: {
        type: "buffalo",
        tileSize: 8,
        background: [165, 30, 38],
        foreground: [20, 22, 26],
      },
    },
    STC_RIVETDOT: {
      pattern: {
        type: "polkadot",
        tileSize: 7,
        background: [40, 44, 50],
        foreground: [205, 212, 220],
      },
    },
    STC_FORGEKEY: {
      pattern: {
        type: "greek_key",
        tileSize: 10,
        background: [20, 22, 26],
        foreground: [195, 155, 80],
      },
    },
    STC_GIRDERBONE: {
      pattern: {
        type: "herringbone",
        tileSize: 8,
        background: [62, 68, 76],
        foreground: [122, 130, 140],
      },
    },
    STC_EMBERFLECK: {
      pattern: {
        type: "kanoko",
        tileSize: 8,
        background: [20, 22, 26],
        foreground: [235, 120, 45],
      },
    },
    STC_ANVILSTRIPE: {
      pattern: {
        type: "diagonal",
        tileSize: 8,
        background: [20, 22, 26],
        foreground: [122, 130, 140],
      },
    },
    STC_SHIELDSTAR: {
      pattern: {
        type: "eight_point_star",
        tileSize: 11,
        background: [62, 68, 76],
        foreground: [250, 180, 70],
      },
    },
    STC_PLATEPANE: {
      pattern: {
        type: "windowpane",
        tileSize: 10,
        background: [20, 22, 26],
        foreground: [85, 150, 140],
      },
    },
  },
};
