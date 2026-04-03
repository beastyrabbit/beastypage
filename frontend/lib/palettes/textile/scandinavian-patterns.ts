import type { PaletteCategory } from "../types";

export const scandinavianPatternsPalette: PaletteCategory = {
  id: "scandinavian-patterns",
  label: "Scandinavian Patterns",
  description:
    "Nordic knit traditions — pixel-art snowflakes and diamond lozenges in cool Scandinavian tones",
  colors: {
    // Nordic snowflake — white on navy (classic Norwegian knit)
    NO_SNOW_FINE: {
      pattern: {
        type: "nordic_snowflake",
        tileSize: 8,
        background: [15, 28, 62],
        foreground: [235, 232, 225],
      },
    },
    NO_SNOW_MED: {
      pattern: {
        type: "nordic_snowflake",
        tileSize: 14,
        background: [15, 28, 62],
        foreground: [235, 232, 225],
      },
    },
    NO_SNOW_BOLD: {
      pattern: {
        type: "nordic_snowflake",
        tileSize: 22,
        background: [15, 28, 62],
        foreground: [235, 232, 225],
      },
    },
    // Nordic snowflake — red on cream (Swedish Dala)
    SE_SNOW_FINE: {
      pattern: {
        type: "nordic_snowflake",
        tileSize: 8,
        background: [235, 228, 215],
        foreground: [185, 28, 28],
      },
    },
    SE_SNOW_MED: {
      pattern: {
        type: "nordic_snowflake",
        tileSize: 14,
        background: [235, 228, 215],
        foreground: [185, 28, 28],
      },
    },
    SE_SNOW_BOLD: {
      pattern: {
        type: "nordic_snowflake",
        tileSize: 22,
        background: [235, 228, 215],
        foreground: [185, 28, 28],
      },
    },
    // Nordic diamond — ice blue on charcoal (Icelandic lopapeysa)
    IS_DIAMOND_FINE: {
      pattern: {
        type: "nordic_diamond",
        tileSize: 8,
        background: [42, 42, 48],
        foreground: [135, 175, 205],
      },
    },
    IS_DIAMOND_MED: {
      pattern: {
        type: "nordic_diamond",
        tileSize: 14,
        background: [42, 42, 48],
        foreground: [135, 175, 205],
      },
    },
    IS_DIAMOND_BOLD: {
      pattern: {
        type: "nordic_diamond",
        tileSize: 22,
        background: [42, 42, 48],
        foreground: [135, 175, 205],
      },
    },
    // Nordic diamond — cream on forest green (Finnish)
    FI_DIAMOND_FINE: {
      pattern: {
        type: "nordic_diamond",
        tileSize: 8,
        background: [28, 62, 42],
        foreground: [225, 220, 205],
      },
    },
    FI_DIAMOND_MED: {
      pattern: {
        type: "nordic_diamond",
        tileSize: 14,
        background: [28, 62, 42],
        foreground: [225, 220, 205],
      },
    },
    FI_DIAMOND_BOLD: {
      pattern: {
        type: "nordic_diamond",
        tileSize: 22,
        background: [28, 62, 42],
        foreground: [225, 220, 205],
      },
    },
  },
};
