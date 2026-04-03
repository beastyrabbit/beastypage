import type { PaletteCategory } from "../types";

export const artDecoPatternsPalette: PaletteCategory = {
  id: "art-deco-patterns",
  label: "Art Deco",
  description:
    "Roaring Twenties glamour — radiating fan motifs in gold, silver, and jewel tones",
  colors: {
    // Art Deco fan — gold on deep navy (Gatsby glam)
    AD_FAN_GOLD_FINE: {
      pattern: {
        type: "art_deco_fan",
        tileSize: 10,
        background: [12, 15, 42],
        foreground: [210, 175, 55],
      },
    },
    AD_FAN_GOLD_MED: {
      pattern: {
        type: "art_deco_fan",
        tileSize: 18,
        background: [12, 15, 42],
        foreground: [210, 175, 55],
      },
    },
    AD_FAN_GOLD_BOLD: {
      pattern: {
        type: "art_deco_fan",
        tileSize: 28,
        background: [12, 15, 42],
        foreground: [210, 175, 55],
      },
    },
    // Art Deco fan — silver on black (cinema noir)
    AD_FAN_SILVER_FINE: {
      pattern: {
        type: "art_deco_fan",
        tileSize: 10,
        background: [10, 10, 12],
        foreground: [190, 195, 205],
      },
    },
    AD_FAN_SILVER_MED: {
      pattern: {
        type: "art_deco_fan",
        tileSize: 18,
        background: [10, 10, 12],
        foreground: [190, 195, 205],
      },
    },
    AD_FAN_SILVER_BOLD: {
      pattern: {
        type: "art_deco_fan",
        tileSize: 28,
        background: [10, 10, 12],
        foreground: [190, 195, 205],
      },
    },
    // Art Deco fan — jade on cream (Shanghai deco)
    AD_FAN_JADE_FINE: {
      pattern: {
        type: "art_deco_fan",
        tileSize: 10,
        background: [238, 232, 218],
        foreground: [28, 98, 72],
      },
    },
    AD_FAN_JADE_MED: {
      pattern: {
        type: "art_deco_fan",
        tileSize: 18,
        background: [238, 232, 218],
        foreground: [28, 98, 72],
      },
    },
    AD_FAN_JADE_BOLD: {
      pattern: {
        type: "art_deco_fan",
        tileSize: 28,
        background: [238, 232, 218],
        foreground: [28, 98, 72],
      },
    },
    // Art Deco fan — coral on teal (Miami deco)
    AD_FAN_CORAL_FINE: {
      pattern: {
        type: "art_deco_fan",
        tileSize: 10,
        background: [18, 72, 78],
        foreground: [228, 108, 82],
      },
    },
    AD_FAN_CORAL_MED: {
      pattern: {
        type: "art_deco_fan",
        tileSize: 18,
        background: [18, 72, 78],
        foreground: [228, 108, 82],
      },
    },
    AD_FAN_CORAL_BOLD: {
      pattern: {
        type: "art_deco_fan",
        tileSize: 28,
        background: [18, 72, 78],
        foreground: [228, 108, 82],
      },
    },
  },
};
