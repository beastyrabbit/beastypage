import type { PaletteCategory } from './types';

export const mushishiPalette: PaletteCategory = {
  id: 'mushishi',
  label: 'Mushishi',
  description: 'Muted forest greens, misty blues, and ethereal watercolor tones',
  colors: {
    MUSHISHI_MUSHI: { multiply: [122, 158, 126] },
    MUSHISHI_GINKO: { multiply: [143, 191, 159] },
    MUSHISHI_FOREST: { multiply: [74, 93, 74] },
    MUSHISHI_MIST: { multiply: [184, 201, 196] },
    MUSHISHI_EARTH: { multiply: [139, 115, 85] },
    MUSHISHI_WATER: { multiply: [107, 142, 159] },
    MUSHISHI_SILVER: { multiply: [197, 197, 197] },
    MUSHISHI_SPIRIT: { multiply: [212, 228, 220], screen: [230, 245, 240, 0.15] },
  },
};
