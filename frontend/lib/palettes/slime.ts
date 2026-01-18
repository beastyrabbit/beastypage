import type { PaletteCategory } from './types';

export const slimePalette: PaletteCategory = {
  id: 'slime',
  label: 'Reincarnated as a Slime',
  description: 'Rimuru Tempest, monster nation, and isekai adventure colors',
  colors: {
    SLIME_RIMURU: { multiply: [147, 185, 232] },
    SLIME_TEMPEST: { multiply: [58, 113, 164] },
    SLIME_SPIRIT: { multiply: [204, 233, 246] },
    SLIME_PURE: { multiply: [247, 252, 252], screen: [255, 255, 255, 0.1] },
    SLIME_BENIMARU: { multiply: [231, 96, 110] },
    SLIME_SOUEI: { multiply: [73, 126, 193] },
    SLIME_GOBLIN: { multiply: [166, 182, 120] },
    SLIME_VELDORA: { multiply: [103, 105, 117] },
  },
};
