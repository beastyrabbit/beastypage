import type { PaletteCategory } from './types';

export const titanicPalette: PaletteCategory = {
  id: 'titanic',
  label: 'Titanic',
  description: 'Atlantic ocean depths, golden opulence, and starlit romance',
  colors: {
    TITANIC_OCEAN: { multiply: [52, 76, 101] },
    TITANIC_GOLD: { multiply: [233, 186, 36] },
    TITANIC_ROSE: { multiply: [252, 132, 124] },
    TITANIC_DECK: { multiply: [172, 108, 53] },
    TITANIC_NIGHTSKY: { multiply: [42, 37, 33] },
    TITANIC_STARLIGHT: { multiply: [172, 196, 212] },
    TITANIC_CREAM: { multiply: [252, 188, 116] },
    TITANIC_DEPTHS: { multiply: [52, 52, 60] },
  },
};
