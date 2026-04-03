import type { PaletteCategory } from "../types";

export const pinstripePatternsPalette: PaletteCategory = {
  id: "pinstripe-patterns",
  label: "Pinstripe Patterns",
  description:
    "Classic pinstripes at 3 scales — fine (tight lines), medium, and bold (wide spacing)",
  colors: {
    PP_NAVY_FINE: {
      pattern: {
        type: "pinstripe",
        tileSize: 4,
        background: [20, 25, 55],
        foreground: [180, 180, 195],
        spacing: 4,
      },
    },
    PP_NAVY_MED: {
      pattern: {
        type: "pinstripe",
        tileSize: 8,
        background: [20, 25, 55],
        foreground: [180, 180, 195],
        spacing: 8,
      },
    },
    PP_NAVY_BOLD: {
      pattern: {
        type: "pinstripe",
        tileSize: 14,
        background: [20, 25, 55],
        foreground: [180, 180, 195],
        spacing: 14,
      },
    },
    PP_CHARCOAL_FINE: {
      pattern: {
        type: "pinstripe",
        tileSize: 4,
        background: [45, 45, 48],
        foreground: [160, 160, 165],
        spacing: 4,
      },
    },
    PP_CHARCOAL_MED: {
      pattern: {
        type: "pinstripe",
        tileSize: 8,
        background: [45, 45, 48],
        foreground: [160, 160, 165],
        spacing: 8,
      },
    },
    PP_CHARCOAL_BOLD: {
      pattern: {
        type: "pinstripe",
        tileSize: 14,
        background: [45, 45, 48],
        foreground: [160, 160, 165],
        spacing: 14,
      },
    },
    PP_BROWN_FINE: {
      pattern: {
        type: "pinstripe",
        tileSize: 4,
        background: [65, 40, 22],
        foreground: [185, 165, 135],
        spacing: 4,
      },
    },
    PP_BROWN_MED: {
      pattern: {
        type: "pinstripe",
        tileSize: 8,
        background: [65, 40, 22],
        foreground: [185, 165, 135],
        spacing: 8,
      },
    },
    PP_BROWN_BOLD: {
      pattern: {
        type: "pinstripe",
        tileSize: 14,
        background: [65, 40, 22],
        foreground: [185, 165, 135],
        spacing: 14,
      },
    },
    PP_BLACK_FINE: {
      pattern: {
        type: "pinstripe",
        tileSize: 4,
        background: [12, 12, 14],
        foreground: [200, 200, 205],
        spacing: 4,
      },
    },
    PP_BLACK_MED: {
      pattern: {
        type: "pinstripe",
        tileSize: 8,
        background: [12, 12, 14],
        foreground: [200, 200, 205],
        spacing: 8,
      },
    },
    PP_BLACK_BOLD: {
      pattern: {
        type: "pinstripe",
        tileSize: 14,
        background: [12, 12, 14],
        foreground: [200, 200, 205],
        spacing: 14,
      },
    },
    PP_MIDNIGHT_FINE: {
      pattern: {
        type: "pinstripe",
        tileSize: 4,
        background: [15, 15, 35],
        foreground: [150, 155, 175],
        spacing: 4,
      },
    },
    PP_MIDNIGHT_MED: {
      pattern: {
        type: "pinstripe",
        tileSize: 8,
        background: [15, 15, 35],
        foreground: [150, 155, 175],
        spacing: 8,
      },
    },
    PP_MIDNIGHT_BOLD: {
      pattern: {
        type: "pinstripe",
        tileSize: 14,
        background: [15, 15, 35],
        foreground: [150, 155, 175],
        spacing: 14,
      },
    },
  },
};
