import type { PaletteCategory } from "../types";

export const europeanOrnatePalette: PaletteCategory = {
  id: "european-ornate",
  label: "European Ornate",
  description:
    "Classical European ornamental patterns — fleur-de-lis, Greek key meanders, and eight-pointed stars",
  colors: {
    // Fleur-de-lis — royal gold on deep navy (French heraldic)
    EU_FLEUR_GOLD_FINE: {
      pattern: {
        type: "fleur_de_lis",
        tileSize: 14,
        background: [15, 18, 52],
        foreground: [210, 175, 55],
      },
    },
    EU_FLEUR_GOLD_MED: {
      pattern: {
        type: "fleur_de_lis",
        tileSize: 22,
        background: [15, 18, 52],
        foreground: [210, 175, 55],
      },
    },
    EU_FLEUR_GOLD_BOLD: {
      pattern: {
        type: "fleur_de_lis",
        tileSize: 32,
        background: [15, 18, 52],
        foreground: [210, 175, 55],
      },
    },
    // Fleur-de-lis — ivory on burgundy (regal velvet)
    EU_FLEUR_IVORY_FINE: {
      pattern: {
        type: "fleur_de_lis",
        tileSize: 14,
        background: [85, 15, 28],
        foreground: [235, 230, 215],
      },
    },
    EU_FLEUR_IVORY_MED: {
      pattern: {
        type: "fleur_de_lis",
        tileSize: 22,
        background: [85, 15, 28],
        foreground: [235, 230, 215],
      },
    },
    EU_FLEUR_IVORY_BOLD: {
      pattern: {
        type: "fleur_de_lis",
        tileSize: 32,
        background: [85, 15, 28],
        foreground: [235, 230, 215],
      },
    },
    // Fleur-de-lis — silver on charcoal (modern gothic)
    EU_FLEUR_SILVER_FINE: {
      pattern: {
        type: "fleur_de_lis",
        tileSize: 14,
        background: [38, 38, 42],
        foreground: [185, 190, 200],
      },
    },
    EU_FLEUR_SILVER_MED: {
      pattern: {
        type: "fleur_de_lis",
        tileSize: 22,
        background: [38, 38, 42],
        foreground: [185, 190, 200],
      },
    },
    EU_FLEUR_SILVER_BOLD: {
      pattern: {
        type: "fleur_de_lis",
        tileSize: 32,
        background: [38, 38, 42],
        foreground: [185, 190, 200],
      },
    },
    // Greek key — terracotta on cream (classical Hellenic)
    EU_GREEK_TERRA_FINE: {
      pattern: {
        type: "greek_key",
        tileSize: 10,
        background: [240, 232, 215],
        foreground: [165, 68, 35],
      },
    },
    EU_GREEK_TERRA_MED: {
      pattern: {
        type: "greek_key",
        tileSize: 18,
        background: [240, 232, 215],
        foreground: [165, 68, 35],
      },
    },
    EU_GREEK_TERRA_BOLD: {
      pattern: {
        type: "greek_key",
        tileSize: 28,
        background: [240, 232, 215],
        foreground: [165, 68, 35],
      },
    },
    // Greek key — gold on black (neoclassical luxury)
    EU_GREEK_GOLD_FINE: {
      pattern: {
        type: "greek_key",
        tileSize: 10,
        background: [15, 12, 10],
        foreground: [205, 170, 50],
      },
    },
    EU_GREEK_GOLD_MED: {
      pattern: {
        type: "greek_key",
        tileSize: 18,
        background: [15, 12, 10],
        foreground: [205, 170, 50],
      },
    },
    EU_GREEK_GOLD_BOLD: {
      pattern: {
        type: "greek_key",
        tileSize: 28,
        background: [15, 12, 10],
        foreground: [205, 170, 50],
      },
    },
    // Eight-point star — sapphire on cream (Gothic rose window)
    EU_STAR_SAPPHIRE_FINE: {
      pattern: {
        type: "eight_point_star",
        tileSize: 8,
        background: [235, 230, 218],
        foreground: [28, 42, 120],
      },
    },
    EU_STAR_SAPPHIRE_MED: {
      pattern: {
        type: "eight_point_star",
        tileSize: 14,
        background: [235, 230, 218],
        foreground: [28, 42, 120],
      },
    },
    EU_STAR_SAPPHIRE_BOLD: {
      pattern: {
        type: "eight_point_star",
        tileSize: 22,
        background: [235, 230, 218],
        foreground: [28, 42, 120],
      },
    },
    // Eight-point star — ruby on midnight (Byzantine mosaic)
    EU_STAR_RUBY_FINE: {
      pattern: {
        type: "eight_point_star",
        tileSize: 8,
        background: [12, 10, 28],
        foreground: [175, 25, 40],
      },
    },
    EU_STAR_RUBY_MED: {
      pattern: {
        type: "eight_point_star",
        tileSize: 14,
        background: [12, 10, 28],
        foreground: [175, 25, 40],
      },
    },
    EU_STAR_RUBY_BOLD: {
      pattern: {
        type: "eight_point_star",
        tileSize: 22,
        background: [12, 10, 28],
        foreground: [175, 25, 40],
      },
    },
  },
};
