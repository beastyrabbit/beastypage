import type { PaletteCategory } from "../types";

export const crystalclanPalette: PaletteCategory = {
  id: "crystalclan",
  label: "CrystalClan",
  description:
    "The geode cavern — dull stone shells cracked open to amethyst, aquamarine, citrine, and clear quartz light",
  colors: {
    CRC_GEODESHELL: { multiply: [38, 34, 44] },
    CRC_STONECRUST: { multiply: [70, 64, 80] },
    CRC_DUSKROCK: { multiply: [105, 95, 115] },
    CRC_AMETHYSTDEEP: { multiply: [88, 42, 140] },
    CRC_AMETHYST: { multiply: [130, 75, 195] },
    CRC_VIOLETGLOW: { multiply: [170, 120, 235] },
    CRC_LILACFACET: { multiply: [205, 170, 245] },
    CRC_ROSEQUARTZ: { multiply: [240, 170, 200] },
    CRC_MORGANITE: { multiply: [250, 205, 220] },
    CRC_CELESTITE: { multiply: [130, 185, 240] },
    CRC_AQUAMARINE: { multiply: [110, 220, 225] },
    CRC_FLUORITE: { multiply: [90, 225, 170] },
    CRC_CITRINE: { multiply: [250, 210, 110] },
    CRC_OPALSHEEN: { multiply: [225, 215, 235] },
    CRC_CLEARQUARTZ: { multiply: [240, 240, 248] },
    CRC_GEODEDOT: {
      pattern: {
        type: "polkadot",
        tileSize: 8,
        background: [38, 34, 44],
        foreground: [170, 120, 235],
      },
    },
    CRC_FACETARGYLE: {
      pattern: {
        type: "argyle",
        tileSize: 12,
        background: [88, 42, 140],
        foreground: [205, 170, 245],
      },
    },
    CRC_PRISMHISHI: {
      pattern: {
        type: "hishi",
        tileSize: 9,
        background: [38, 34, 44],
        foreground: [110, 220, 225],
      },
    },
    CRC_CRYSTALFAN: {
      pattern: {
        type: "art_deco_fan",
        tileSize: 11,
        background: [38, 34, 44],
        foreground: [130, 75, 195],
      },
    },
    CRC_STARFACET: {
      pattern: {
        type: "eight_point_star",
        tileSize: 11,
        background: [70, 64, 80],
        foreground: [250, 210, 110],
      },
    },
    CRC_SHARDSTRIPE: {
      pattern: {
        type: "diagonal",
        tileSize: 8,
        background: [38, 34, 44],
        foreground: [170, 120, 235],
      },
    },
    CRC_GLASSSHIPPO: {
      pattern: {
        type: "shippo",
        tileSize: 9,
        background: [130, 185, 240],
        foreground: [240, 240, 248],
      },
    },
    CRC_GEMCHECKER: {
      pattern: {
        type: "checkerboard",
        tileSize: 8,
        background: [130, 75, 195],
        foreground: [110, 220, 225],
      },
    },
    CRC_CAVELATTICE: {
      pattern: {
        type: "chinese_lattice",
        tileSize: 10,
        background: [38, 34, 44],
        foreground: [205, 170, 245],
      },
    },
    CRC_DRUZYKANOKO: {
      pattern: {
        type: "kanoko",
        tileSize: 8,
        background: [88, 42, 140],
        foreground: [240, 240, 248],
      },
    },
  },
};
