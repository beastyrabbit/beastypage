import type { PaletteCategory } from '../types';

export const oceanDepthsPalette: PaletteCategory = {
  id: 'ocean-depths',
  label: 'Ocean Depths',
  description: 'Blue — from violet-tinged abyss to sun-dappled shallows',
  colors: {
    OD_VOIDTRENCH: { multiply: [8, 5, 28] },
    OD_ABYSS: { multiply: [12, 8, 42] },
    OD_MARIANA: { multiply: [18, 15, 58] },
    OD_DEEPCURRENT: { multiply: [22, 28, 78] },
    OD_NAUTICAL: { multiply: [25, 45, 105] },
    OD_SAPPHIRE: { multiply: [28, 58, 138] },
    OD_COBALT: { multiply: [35, 75, 162] },
    OD_ATLANTIC: { multiply: [42, 95, 182] },
    OD_PACIFIC: { multiply: [50, 112, 198] },
    OD_ULTRAMARINE: { multiply: [58, 128, 210] },
    OD_AZURE: { multiply: [68, 145, 218] },
    OD_HORIZON: { multiply: [82, 160, 222] },
    OD_CLEARWATER: { multiply: [98, 175, 225] },
    OD_SHALLOW: { multiply: [115, 188, 226] },
    OD_COASTAL: { multiply: [132, 198, 225] },
    OD_TIDELINE: { multiply: [150, 208, 222] },
    OD_LAGOON: { multiply: [168, 215, 220] },
    OD_GLACIER: { multiply: [182, 220, 218] },
    OD_MORNINGSKY: { multiply: [198, 225, 220] },
    OD_SUNSHALLOW: { multiply: [212, 230, 225] },
  },
};
