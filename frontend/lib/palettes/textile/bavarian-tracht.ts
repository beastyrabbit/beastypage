import type { PaletteCategory } from "../types";

export const bavarianTrachtPalette: PaletteCategory = {
  id: "bavarian-tracht",
  label: "Bavarian Tracht",
  description:
    "German traditional — Dirndl blues, Lederhosen browns, alpine whites and edelweiss",
  colors: {
    BV_ALPINENIGHT: { multiply: [10, 18, 42] },
    BV_DEEPBAVARIAN: { multiply: [18, 30, 68] },
    BV_TRACHTBLUE: { multiply: [28, 48, 105] },
    BV_DIRNDLBLUE: { multiply: [38, 65, 138] },
    BV_ALPINESKY: { multiply: [52, 88, 168] },
    BV_KORNBLUME: { multiply: [68, 108, 192] },
    BV_HIMMELBLAU: { multiply: [95, 138, 210] },
    BV_LEDERBRAUN: { multiply: [85, 55, 28] },
    BV_SATTELBROWN: { multiply: [112, 72, 35] },
    BV_HIRSCHLEDER: { multiply: [142, 95, 48] },
    BV_GAMSLEDER: { multiply: [168, 118, 65] },
    BV_REHBRAUN: { multiply: [188, 142, 85] },
    BV_ALPENROT: { multiply: [178, 28, 32] },
    BV_DIRNDLROT: { multiply: [205, 42, 45] },
    BV_GERANIUM: { multiply: [225, 62, 58] },
    BV_EDELWEISS: { multiply: [238, 235, 225] },
    BV_ALPENWEISS: { multiply: [232, 228, 218] },
    BV_SILBERDISTEL: { multiply: [215, 212, 205] },
    BV_TANNENGRUEN: { multiply: [22, 72, 38] },
    BV_ALMWIESE: { multiply: [45, 115, 55] },
  },
};
