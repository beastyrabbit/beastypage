import type { PaletteCategory } from "../types";

export const sunclanPalette: PaletteCategory = {
  id: "sunclan",
  label: "SunClan",
  description:
    "The gilded dawn — temple gold and desert rose set against royal lapis and turquoise sky",
  colors: {
    SNC_TEMPLEBRONZE: { multiply: [96, 62, 22] },
    SNC_OLDGOLD: { multiply: [150, 104, 32] },
    SNC_ROYALGOLD: { multiply: [205, 150, 40] },
    SNC_PUREGOLD: { multiply: [240, 185, 50] },
    SNC_SUNBURST: { multiply: [252, 210, 80] },
    SNC_LIGHTGOLD: { multiply: [253, 230, 130] },
    SNC_IVORYSUN: { multiply: [250, 242, 205] },
    SNC_SANDSTONE: { multiply: [225, 185, 135] },
    SNC_LAPISBLUE: { multiply: [28, 62, 140] },
    SNC_ROYALLAPIS: { multiply: [40, 86, 180] },
    SNC_SKYTURQUOISE: { multiply: [70, 180, 200] },
    SNC_DAWNCORAL: { multiply: [240, 130, 90] },
    SNC_DESERTROSE: { multiply: [205, 110, 80] },
    SNC_PHARAOHRED: { multiply: [165, 52, 38] },
    SNC_DUSKPLUM: { multiply: [110, 60, 90] },
    SNC_GILDEDKEY: {
      pattern: {
        type: "greek_key",
        tileSize: 10,
        background: [28, 62, 140],
        foreground: [240, 185, 50],
      },
    },
    SNC_SUNDISC: {
      pattern: {
        type: "polkadot",
        tileSize: 8,
        background: [40, 86, 180],
        foreground: [252, 210, 80],
      },
    },
    SNC_HONEYCOMB: {
      pattern: {
        type: "kikko",
        tileSize: 10,
        background: [205, 150, 40],
        foreground: [96, 62, 22],
      },
    },
    SNC_RADIANTSTAR: {
      pattern: {
        type: "eight_point_star",
        tileSize: 11,
        background: [28, 62, 140],
        foreground: [253, 230, 130],
      },
    },
    SNC_KENTEGLOW: {
      pattern: {
        type: "kente",
        tileSize: 12,
        background: [240, 185, 50],
        foreground: [96, 62, 22],
      },
    },
    SNC_DAWNCHEVRON: {
      pattern: {
        type: "chevron",
        tileSize: 10,
        background: [250, 242, 205],
        foreground: [240, 130, 90],
        spacing: 2,
      },
    },
    SNC_RAYSTRIPE: {
      pattern: {
        type: "diagonal",
        tileSize: 8,
        background: [252, 210, 80],
        foreground: [205, 110, 80],
      },
    },
    SNC_TEMPLEDAMASK: {
      pattern: {
        type: "damask",
        tileSize: 12,
        background: [250, 242, 205],
        foreground: [205, 150, 40],
      },
    },
    SNC_SCARABCHECK: {
      pattern: {
        type: "checkerboard",
        tileSize: 8,
        background: [28, 62, 140],
        foreground: [240, 185, 50],
      },
    },
    SNC_NILEWAVE: {
      pattern: {
        type: "seigaiha",
        tileSize: 9,
        background: [40, 86, 180],
        foreground: [253, 230, 130],
      },
    },
  },
};
