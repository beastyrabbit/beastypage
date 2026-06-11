import type { PaletteCategory } from "../types";

export const crystalclanPalette: PaletteCategory = {
  id: "crystalclan",
  label: "CrystalClan",
  description:
    "Signature palette of CrystalClan — amethyst depths refracting through prism pastels, opal, citrine, and diamond light",
  colors: {
    CRC_DEEPAMETHYST: { multiply: [70, 40, 110] },
    CRC_VIOLETFACET: { multiply: [105, 65, 150] },
    CRC_SMOKYQUARTZ: { multiply: [120, 100, 95] },
    CRC_LAVENDERGLOW: { multiply: [150, 110, 200] },
    CRC_PRISMVIOLET: { multiply: [175, 130, 235] },
    CRC_LILACSHINE: { multiply: [185, 150, 225] },
    CRC_PASTELVIOLET: { multiply: [210, 185, 240] },
    CRC_SAPPHIRELIGHT: { multiply: [90, 140, 220] },
    CRC_SKYFACET: { multiply: [120, 180, 240] },
    CRC_GLACIERBLUE: { multiply: [160, 210, 245] },
    CRC_EMERALDFACET: { multiply: [80, 180, 140] },
    CRC_AURORAGREEN: { multiply: [150, 230, 200] },
    CRC_MINTPRISM: { multiply: [185, 240, 215] },
    CRC_ROSEQUARTZ: { multiply: [245, 175, 200] },
    CRC_OPALPINK: { multiply: [240, 195, 225] },
    CRC_PRISMPINK: { multiply: [250, 200, 215] },
    CRC_AMBERFACET: { multiply: [240, 200, 120] },
    CRC_CITRINEGLOW: { multiply: [250, 225, 150] },
    CRC_PEARLOPAL: { multiply: [245, 240, 235] },
    CRC_DIAMONDWHITE: { multiply: [250, 250, 252] },
    CRC_FACETARGYLE: {
      pattern: {
        type: "argyle",
        tileSize: 12,
        background: [210, 185, 240],
        foreground: [105, 65, 150],
      },
    },
    CRC_DIAMONDHISHI: {
      pattern: {
        type: "hishi",
        tileSize: 9,
        background: [160, 210, 245],
        foreground: [90, 140, 220],
      },
    },
    CRC_PRISMSTAR: {
      pattern: {
        type: "eight_point_star",
        tileSize: 11,
        background: [245, 240, 235],
        foreground: [175, 130, 235],
      },
    },
    CRC_SHIPPOGLASS: {
      pattern: {
        type: "shippo",
        tileSize: 10,
        background: [185, 240, 215],
        foreground: [120, 180, 240],
      },
    },
    CRC_OPALCHECK: {
      pattern: {
        type: "checkerboard",
        tileSize: 8,
        background: [240, 195, 225],
        foreground: [150, 230, 200],
      },
    },
  },
};
