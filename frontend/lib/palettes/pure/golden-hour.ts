import type { PaletteCategory } from '../types';

export const goldenHourPalette: PaletteCategory = {
  id: 'golden-hour',
  label: 'Golden Hour',
  description: 'Yellow / Amber — burnt sienna shadows through rich saffron to pale butter',
  colors: {
    GH_BURNTUMBER: { multiply: [35, 18, 6] },
    GH_DEEPAMBER: { multiply: [48, 28, 8] },
    GH_DARKHONEY: { multiply: [65, 38, 10] },
    GH_MOLASSES: { multiply: [85, 52, 14] },
    GH_BURNISHEDGOLD: { multiply: [108, 68, 18] },
    GH_OLDGOLD: { multiply: [132, 85, 22] },
    GH_AMBERVEIL: { multiply: [155, 105, 28] },
    GH_HONEYCOMB: { multiply: [178, 125, 35] },
    GH_GOLDENBREW: { multiply: [198, 145, 42] },
    GH_SAFFRON: { multiply: [215, 165, 52] },
    GH_GOLDENSUN: { multiply: [228, 182, 65] },
    GH_SUNBEAM: { multiply: [235, 198, 82] },
    GH_HONEYGLOW: { multiply: [240, 210, 100] },
    GH_WARMLIGHT: { multiply: [242, 218, 120] },
    GH_GOLDENRAY: { multiply: [244, 225, 142] },
    GH_SUNBLUSH: { multiply: [245, 228, 162] },
    GH_BUTTERCREAM: { multiply: [245, 232, 180] },
    GH_PALEHONEY: { multiply: [245, 234, 198] },
    GH_MORNINGGLOW: { multiply: [245, 235, 212] },
    GH_BUTTERLIGHT: { multiply: [242, 235, 222] },
  },
};
