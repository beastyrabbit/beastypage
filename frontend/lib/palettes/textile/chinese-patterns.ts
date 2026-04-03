import type { PaletteCategory } from "../types";

export const chinesePatternsPalette: PaletteCategory = {
  id: "chinese-patterns",
  label: "Chinese Patterns",
  description:
    "Traditional Chinese motifs — lucky coins, cracked-ice lattice, ruyi clouds, and maze meanders",
  colors: {
    // Chinese coin — gold on imperial red
    CN_COIN_GOLD_FINE: {
      pattern: {
        type: "chinese_coin",
        tileSize: 8,
        background: [148, 18, 22],
        foreground: [210, 175, 55],
      },
    },
    CN_COIN_GOLD_MED: {
      pattern: {
        type: "chinese_coin",
        tileSize: 14,
        background: [148, 18, 22],
        foreground: [210, 175, 55],
      },
    },
    CN_COIN_GOLD_BOLD: {
      pattern: {
        type: "chinese_coin",
        tileSize: 22,
        background: [148, 18, 22],
        foreground: [210, 175, 55],
      },
    },
    // Chinese coin — jade on charcoal
    CN_COIN_JADE_FINE: {
      pattern: {
        type: "chinese_coin",
        tileSize: 8,
        background: [38, 38, 42],
        foreground: [88, 165, 120],
      },
    },
    CN_COIN_JADE_MED: {
      pattern: {
        type: "chinese_coin",
        tileSize: 14,
        background: [38, 38, 42],
        foreground: [88, 165, 120],
      },
    },
    CN_COIN_JADE_BOLD: {
      pattern: {
        type: "chinese_coin",
        tileSize: 22,
        background: [38, 38, 42],
        foreground: [88, 165, 120],
      },
    },
    // Cracked-ice lattice — ivory on deep blue (porcelain)
    CN_LATTICE_FINE: {
      pattern: {
        type: "chinese_lattice",
        tileSize: 10,
        background: [18, 32, 78],
        foreground: [230, 225, 215],
      },
    },
    CN_LATTICE_MED: {
      pattern: {
        type: "chinese_lattice",
        tileSize: 18,
        background: [18, 32, 78],
        foreground: [230, 225, 215],
      },
    },
    CN_LATTICE_BOLD: {
      pattern: {
        type: "chinese_lattice",
        tileSize: 28,
        background: [18, 32, 78],
        foreground: [230, 225, 215],
      },
    },
    // Ruyi cloud — gold on imperial red
    CN_RUYI_GOLD_FINE: {
      pattern: {
        type: "ruyi_cloud",
        tileSize: 14,
        background: [148, 18, 22],
        foreground: [220, 185, 55],
      },
    },
    CN_RUYI_GOLD_MED: {
      pattern: {
        type: "ruyi_cloud",
        tileSize: 22,
        background: [148, 18, 22],
        foreground: [220, 185, 55],
      },
    },
    CN_RUYI_GOLD_BOLD: {
      pattern: {
        type: "ruyi_cloud",
        tileSize: 32,
        background: [148, 18, 22],
        foreground: [220, 185, 55],
      },
    },
    // Sayagata maze — cream on indigo (porcelain ware)
    CN_SAYAGATA_FINE: {
      pattern: {
        type: "sayagata",
        tileSize: 8,
        background: [22, 28, 72],
        foreground: [225, 220, 205],
      },
    },
    CN_SAYAGATA_MED: {
      pattern: {
        type: "sayagata",
        tileSize: 16,
        background: [22, 28, 72],
        foreground: [225, 220, 205],
      },
    },
    CN_SAYAGATA_BOLD: {
      pattern: {
        type: "sayagata",
        tileSize: 24,
        background: [22, 28, 72],
        foreground: [225, 220, 205],
      },
    },
  },
};
