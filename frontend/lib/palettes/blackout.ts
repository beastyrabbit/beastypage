import type { PaletteCategory } from './types';

export const blackoutPalette: PaletteCategory = {
  id: 'blackout',
  label: 'Blackout',
  description: 'Near-black shades with subtle color hints for dramatic effect',
  colors: {
    BLACKOUTBLUE: { multiply: [10, 12, 26], screen: [30, 36, 76, 0.08] },
    BLACKOUTPURPLE: { multiply: [12, 10, 24], screen: [54, 30, 80, 0.08] },
    BLACKOUTRED: { multiply: [22, 8, 14], screen: [80, 28, 40, 0.08] },
    BLACKOUTTEAL: { multiply: [8, 20, 22], screen: [36, 80, 82, 0.08] },
    BLACKOUTGREEN: { multiply: [12, 24, 12], screen: [56, 90, 48, 0.08] },
    BLACKOUTGOLD: { multiply: [24, 18, 8], screen: [96, 72, 36, 0.08] },
    STARLESS_NAVY: { multiply: [9, 12, 28], screen: [28, 40, 88, 0.07] },
    NEBULA_INDIGO: { multiply: [11, 10, 26], screen: [36, 30, 84, 0.07] },
    UMBRAL_VIOLET: { multiply: [14, 9, 22], screen: [60, 28, 80, 0.08] },
    CRYPTIC_CRIMSON: { multiply: [22, 9, 14], screen: [92, 30, 42, 0.08] },
    ABYSSAL_TEAL: { multiply: [8, 18, 20], screen: [32, 76, 80, 0.08] },
    MOURNING_EMERALD: { multiply: [12, 22, 14], screen: [50, 90, 56, 0.08] },
    SHADOW_SAPPHIRE: { multiply: [10, 13, 30], screen: [34, 44, 92, 0.07] },
    NOCTURNE_MAGENTA: { multiply: [18, 8, 20], screen: [88, 28, 78, 0.08] },
    PHANTOM_COPPER: { multiply: [20, 14, 10], screen: [90, 70, 50, 0.08] },
    ECLIPSE_SKY: { multiply: [12, 16, 24], screen: [46, 58, 90, 0.07] },
  },
};
