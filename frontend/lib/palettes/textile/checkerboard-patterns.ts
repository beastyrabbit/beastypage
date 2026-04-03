import type { PaletteCategory } from "../types";

export const checkerboardPatternsPalette: PaletteCategory = {
  id: "checkerboard-patterns",
  label: "Checkerboard Patterns",
  description:
    "Alternating square checks at 3 scales — fine (tiny), medium, and bold (large)",
  colors: {
    CB_CLASSIC_FINE: {
      pattern: {
        type: "checkerboard",
        tileSize: 4,
        background: [240, 240, 235],
        foreground: [15, 15, 15],
      },
    },
    CB_CLASSIC_MED: {
      pattern: {
        type: "checkerboard",
        tileSize: 10,
        background: [240, 240, 235],
        foreground: [15, 15, 15],
      },
    },
    CB_CLASSIC_BOLD: {
      pattern: {
        type: "checkerboard",
        tileSize: 18,
        background: [240, 240, 235],
        foreground: [15, 15, 15],
      },
    },
    CB_RED_FINE: {
      pattern: {
        type: "checkerboard",
        tileSize: 4,
        background: [200, 30, 30],
        foreground: [240, 235, 225],
      },
    },
    CB_RED_MED: {
      pattern: {
        type: "checkerboard",
        tileSize: 10,
        background: [200, 30, 30],
        foreground: [240, 235, 225],
      },
    },
    CB_RED_BOLD: {
      pattern: {
        type: "checkerboard",
        tileSize: 18,
        background: [200, 30, 30],
        foreground: [240, 235, 225],
      },
    },
    CB_RACING_FINE: {
      pattern: {
        type: "checkerboard",
        tileSize: 4,
        background: [15, 15, 15],
        foreground: [245, 245, 245],
      },
    },
    CB_RACING_MED: {
      pattern: {
        type: "checkerboard",
        tileSize: 10,
        background: [15, 15, 15],
        foreground: [245, 245, 245],
      },
    },
    CB_RACING_BOLD: {
      pattern: {
        type: "checkerboard",
        tileSize: 18,
        background: [15, 15, 15],
        foreground: [245, 245, 245],
      },
    },
    CB_BLUE_FINE: {
      pattern: {
        type: "checkerboard",
        tileSize: 4,
        background: [25, 45, 130],
        foreground: [230, 235, 245],
      },
    },
    CB_BLUE_MED: {
      pattern: {
        type: "checkerboard",
        tileSize: 10,
        background: [25, 45, 130],
        foreground: [230, 235, 245],
      },
    },
    CB_BLUE_BOLD: {
      pattern: {
        type: "checkerboard",
        tileSize: 18,
        background: [25, 45, 130],
        foreground: [230, 235, 245],
      },
    },
    CB_PINK_FINE: {
      pattern: {
        type: "checkerboard",
        tileSize: 4,
        background: [220, 90, 130],
        foreground: [250, 235, 240],
      },
    },
    CB_PINK_MED: {
      pattern: {
        type: "checkerboard",
        tileSize: 10,
        background: [220, 90, 130],
        foreground: [250, 235, 240],
      },
    },
    CB_PINK_BOLD: {
      pattern: {
        type: "checkerboard",
        tileSize: 18,
        background: [220, 90, 130],
        foreground: [250, 235, 240],
      },
    },
    // Missing texture — the iconic magenta/black checkerboard from Source engine games
    CB_MISSING_FINE: {
      pattern: {
        type: "checkerboard",
        tileSize: 4,
        background: [0, 0, 0],
        foreground: [255, 0, 255],
      },
    },
    CB_MISSING_MED: {
      pattern: {
        type: "checkerboard",
        tileSize: 10,
        background: [0, 0, 0],
        foreground: [255, 0, 255],
      },
    },
    CB_MISSING_BOLD: {
      pattern: {
        type: "checkerboard",
        tileSize: 18,
        background: [0, 0, 0],
        foreground: [255, 0, 255],
      },
    },
  },
};
