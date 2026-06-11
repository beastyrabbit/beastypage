import type { PaletteCategory } from "../types";

export const moonclanPalette: PaletteCategory = {
  id: "moonclan",
  label: "MoonClan",
  description:
    "The aurora night — polar dark and moonlit silver swept by curtains of aurora teal, violet, and ice",
  colors: {
    MNC_POLARNIGHT: { multiply: [10, 14, 26] },
    MNC_NIGHTSKY: { multiply: [22, 30, 52] },
    MNC_STARLITSLATE: { multiply: [44, 56, 86] },
    MNC_HORIZONBLUE: { multiply: [70, 92, 130] },
    MNC_MOONSTEEL: { multiply: [108, 124, 150] },
    MNC_SILVERLIGHT: { multiply: [160, 172, 190] },
    MNC_MOONGLOW: { multiply: [210, 218, 230] },
    MNC_SNOWWHITE: { multiply: [244, 248, 252] },
    MNC_AURORATEAL: { multiply: [60, 210, 170] },
    MNC_AURORAGREEN: { multiply: [120, 235, 150] },
    MNC_AURORAVIOLET: { multiply: [150, 110, 230] },
    MNC_AURORAPINK: { multiply: [225, 130, 200] },
    MNC_ICEBLUE: { multiply: [150, 210, 240] },
    MNC_COMETGOLD: { multiply: [240, 225, 160] },
    MNC_FROSTLILAC: { multiply: [195, 185, 225] },
    MNC_AURORAVEIL: {
      pattern: {
        type: "tachiwaki",
        tileSize: 10,
        background: [10, 14, 26],
        foreground: [60, 210, 170],
      },
    },
    MNC_STARFIELD: {
      pattern: {
        type: "polkadot",
        tileSize: 9,
        background: [10, 14, 26],
        foreground: [244, 248, 252],
      },
    },
    MNC_NORTHSTAR: {
      pattern: {
        type: "eight_point_star",
        tileSize: 11,
        background: [22, 30, 52],
        foreground: [240, 225, 160],
      },
    },
    MNC_FROSTFLAKE: {
      pattern: {
        type: "nordic_snowflake",
        tileSize: 11,
        background: [44, 56, 86],
        foreground: [150, 210, 240],
      },
    },
    MNC_AURORACHEVRON: {
      pattern: {
        type: "chevron",
        tileSize: 10,
        background: [10, 14, 26],
        foreground: [150, 110, 230],
        spacing: 2,
      },
    },
    MNC_MOONPHASE: {
      pattern: {
        type: "shippo",
        tileSize: 9,
        background: [22, 30, 52],
        foreground: [210, 218, 230],
      },
    },
    MNC_NIGHTPANE: {
      pattern: {
        type: "windowpane",
        tileSize: 10,
        background: [10, 14, 26],
        foreground: [108, 124, 150],
      },
    },
    MNC_GLACIERDIAMOND: {
      pattern: {
        type: "nordic_diamond",
        tileSize: 10,
        background: [44, 56, 86],
        foreground: [150, 210, 240],
      },
    },
    MNC_TWILIGHTSTRIPE: {
      pattern: {
        type: "pinstripe",
        tileSize: 8,
        background: [22, 30, 52],
        foreground: [160, 172, 190],
      },
    },
    MNC_POLARMIST: {
      pattern: {
        type: "kanoko",
        tileSize: 8,
        background: [44, 56, 86],
        foreground: [210, 218, 230],
      },
    },
  },
};
