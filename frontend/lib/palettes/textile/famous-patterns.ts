import type { PaletteCategory } from "../types";

export const famousPatternsPalette: PaletteCategory = {
  id: "famous-patterns",
  label: "Famous Patterns",
  description:
    "Iconic textile patterns — garden trellis, diamond hishi, and ring-dot kanoko tie-dye",
  colors: {
    // Trellis — ivory on deep green (English garden)
    FP_TRELLIS_GREEN_FINE: {
      pattern: {
        type: "trellis",
        tileSize: 6,
        background: [22, 62, 38],
        foreground: [225, 222, 210],
      },
    },
    FP_TRELLIS_GREEN_MED: {
      pattern: {
        type: "trellis",
        tileSize: 12,
        background: [22, 62, 38],
        foreground: [225, 222, 210],
      },
    },
    FP_TRELLIS_GREEN_BOLD: {
      pattern: {
        type: "trellis",
        tileSize: 20,
        background: [22, 62, 38],
        foreground: [225, 222, 210],
      },
    },
    // Trellis — gold on navy (luxury)
    FP_TRELLIS_GOLD_FINE: {
      pattern: {
        type: "trellis",
        tileSize: 6,
        background: [15, 18, 52],
        foreground: [210, 175, 55],
      },
    },
    FP_TRELLIS_GOLD_MED: {
      pattern: {
        type: "trellis",
        tileSize: 12,
        background: [15, 18, 52],
        foreground: [210, 175, 55],
      },
    },
    FP_TRELLIS_GOLD_BOLD: {
      pattern: {
        type: "trellis",
        tileSize: 20,
        background: [15, 18, 52],
        foreground: [210, 175, 55],
      },
    },
    // Hishi — gold on crimson (Japanese diamond)
    FP_HISHI_FINE: {
      pattern: {
        type: "hishi",
        tileSize: 8,
        background: [148, 18, 22],
        foreground: [210, 175, 55],
      },
    },
    FP_HISHI_MED: {
      pattern: {
        type: "hishi",
        tileSize: 14,
        background: [148, 18, 22],
        foreground: [210, 175, 55],
      },
    },
    FP_HISHI_BOLD: {
      pattern: {
        type: "hishi",
        tileSize: 22,
        background: [148, 18, 22],
        foreground: [210, 175, 55],
      },
    },
    // Kanoko — white dots on indigo (Japanese shibori)
    FP_KANOKO_FINE: {
      pattern: {
        type: "kanoko",
        tileSize: 6,
        background: [22, 28, 72],
        foreground: [225, 220, 212],
      },
    },
    FP_KANOKO_MED: {
      pattern: {
        type: "kanoko",
        tileSize: 12,
        background: [22, 28, 72],
        foreground: [225, 220, 212],
      },
    },
    FP_KANOKO_BOLD: {
      pattern: {
        type: "kanoko",
        tileSize: 20,
        background: [22, 28, 72],
        foreground: [225, 220, 212],
      },
    },
  },
};
