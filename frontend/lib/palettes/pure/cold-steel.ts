import type { PaletteCategory } from '../types';

export const coldSteelPalette: PaletteCategory = {
  id: 'cold-steel',
  label: 'Cold Steel',
  description: 'Cool grey — blue-tinged industrial tones from forge black to frozen chrome',
  colors: {
    CS_FORGEBLACK: { multiply: [6, 8, 14] },
    CS_ANVIL: { multiply: [14, 17, 25] },
    CS_CRUCIBLE: { multiply: [24, 28, 38] },
    CS_TUNGSTEN: { multiply: [36, 40, 52] },
    CS_IRONWORKS: { multiply: [50, 55, 68] },
    CS_BLUESTEEL: { multiply: [65, 70, 85] },
    CS_FOUNDRY: { multiply: [80, 85, 100] },
    CS_GIRDER: { multiply: [96, 100, 115] },
    CS_RIVET: { multiply: [112, 116, 128] },
    CS_ALLOY: { multiply: [130, 133, 142] },
    CS_BRUSHEDMETAL: { multiply: [148, 150, 158] },
    CS_GALVANIZED: { multiply: [162, 165, 172] },
    CS_TINPLATE: { multiply: [178, 180, 185] },
    CS_CHROMATIC: { multiply: [192, 194, 198] },
    CS_POLISHED: { multiply: [204, 206, 210] },
    CS_FROSTIRON: { multiply: [214, 216, 220] },
    CS_COOLMINT: { multiply: [222, 224, 226] },
    CS_ICEFORGE: { multiply: [228, 229, 232] },
    CS_WINTERSTEEL: { multiply: [232, 233, 236] },
    CS_FROZENCHROME: { multiply: [236, 237, 240] },
  },
};
