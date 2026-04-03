import type { PaletteCategory } from "../types";

export const greyscalePalette: PaletteCategory = {
  id: "greyscale",
  label: "Silver Screen",
  description:
    "Greyscale — classic film noir tones from darkroom black to projector white",
  colors: {
    SS_FILMREEL: { multiply: [8, 8, 8] },
    SS_DARKROOM: { multiply: [18, 18, 18] },
    SS_NOIR: { multiply: [30, 30, 30] },
    SS_CELLULOID: { multiply: [42, 42, 42] },
    SS_DIRECTOR: { multiply: [56, 56, 56] },
    SS_SCREENPLAY: { multiply: [72, 72, 72] },
    SS_MONTAGE: { multiply: [88, 88, 88] },
    SS_NEWSREEL: { multiply: [105, 105, 105] },
    SS_PREMIERE: { multiply: [122, 122, 122] },
    SS_MARQUEE: { multiply: [140, 140, 140] },
    SS_FLASHBACK: { multiply: [158, 158, 158] },
    SS_MATINEE: { multiply: [172, 172, 172] },
    SS_SILVERSCREEN: { multiply: [188, 188, 188] },
    SS_SPOTLIGHT: { multiply: [200, 200, 200] },
    SS_OVERTURE: { multiply: [212, 212, 212] },
    SS_INTERMISSION: { multiply: [220, 220, 220] },
    SS_CURTAINCALL: { multiply: [225, 225, 225] },
    SS_FADEOUT: { multiply: [230, 230, 230] },
    SS_CREDITS: { multiply: [234, 234, 234] },
    SS_STARDUST: { multiply: [238, 238, 238] },
  },
};
