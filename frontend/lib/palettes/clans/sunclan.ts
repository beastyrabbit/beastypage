import type { PaletteCategory } from "../types";

export const sunclanPalette: PaletteCategory = {
  id: "sunclan",
  label: "SunClan",
  description:
    "Signature palette of SunClan — deep amber and honey through noon gold to dawn cream and apricot light",
  colors: {
    SNC_DUSKAMBER: { multiply: [88, 52, 18] },
    SNC_HONEYDEEP: { multiply: [126, 78, 24] },
    SNC_HARVESTBROWN: { multiply: [150, 96, 48] },
    SNC_AMBERCORE: { multiply: [160, 104, 30] },
    SNC_GOLDENORE: { multiply: [192, 132, 36] },
    SNC_SAFFRONWARM: { multiply: [210, 120, 40] },
    SNC_SUNGOLD: { multiply: [218, 158, 44] },
    SNC_MARIGOLD: { multiply: [232, 148, 60] },
    SNC_RAYGOLD: { multiply: [236, 180, 56] },
    SNC_APRICOTSUN: { multiply: [240, 170, 110] },
    SNC_NOONGLOW: { multiply: [248, 200, 74] },
    SNC_SOLARFLARE: { multiply: [255, 210, 90] },
    SNC_PEACHDAWN: { multiply: [246, 196, 140] },
    SNC_DAYLIGHT: { multiply: [252, 216, 104] },
    SNC_WHEATFIELD: { multiply: [222, 196, 140] },
    SNC_HONEYLIGHT: { multiply: [253, 228, 140] },
    SNC_CREAMGLOW: { multiply: [252, 238, 178] },
    SNC_SKYWARM: { multiply: [250, 222, 190] },
    SNC_DAWNCREAM: { multiply: [250, 244, 210] },
    SNC_MORNINGMILK: { multiply: [248, 246, 230] },
    SNC_SUNRAYS: {
      pattern: {
        type: "diagonal",
        tileSize: 8,
        background: [248, 200, 74],
        foreground: [210, 120, 40],
      },
    },
    SNC_HONEYCOMB: {
      pattern: {
        type: "kikko",
        tileSize: 10,
        background: [218, 158, 44],
        foreground: [126, 78, 24],
      },
    },
    SNC_DAWNCHEVRON: {
      pattern: {
        type: "chevron",
        tileSize: 10,
        background: [250, 222, 190],
        foreground: [232, 148, 60],
        spacing: 2,
      },
    },
    SNC_SOLARDOT: {
      pattern: {
        type: "polkadot",
        tileSize: 7,
        background: [126, 78, 24],
        foreground: [255, 210, 90],
      },
    },
    SNC_GOLDDAMASK: {
      pattern: {
        type: "damask",
        tileSize: 12,
        background: [252, 238, 178],
        foreground: [192, 132, 36],
      },
    },
  },
};
