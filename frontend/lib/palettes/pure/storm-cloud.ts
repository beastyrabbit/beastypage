import type { PaletteCategory } from '../types';

export const stormCloudPalette: PaletteCategory = {
  id: 'storm-cloud',
  label: 'Storm Cloud',
  description: 'Gray — cool blue-slate shadows through true iron to warm silver-taupe highlights',
  colors: {
    SC_DEEPSLATE: { multiply: [10, 12, 18] },
    SC_THUNDERHEAD: { multiply: [18, 20, 28] },
    SC_CHARCOAL: { multiply: [28, 30, 38] },
    SC_GUNMETAL: { multiply: [40, 42, 50] },
    SC_STORMFRONT: { multiply: [55, 56, 65] },
    SC_DARKSLATE: { multiply: [70, 72, 80] },
    SC_IRONSKY: { multiply: [88, 88, 95] },
    SC_PEWTER: { multiply: [105, 105, 110] },
    SC_STEELGRAY: { multiply: [122, 122, 125] },
    SC_CLOUDBANK: { multiply: [140, 140, 140] },
    SC_OVERCAST: { multiply: [158, 158, 155] },
    SC_ASHGRAY: { multiply: [172, 172, 168] },
    SC_SILVERLINING: { multiply: [188, 188, 182] },
    SC_SOFTGRAY: { multiply: [200, 200, 195] },
    SC_FOGBANK: { multiply: [212, 212, 208] },
    SC_WARMSILVER: { multiply: [220, 220, 215] },
    SC_PALECLOUD: { multiply: [225, 225, 222] },
    SC_TAUPESILVER: { multiply: [230, 228, 225] },
    SC_WARMFOG: { multiply: [232, 230, 228] },
    SC_SILVERDAWN: { multiply: [235, 232, 230] },
  },
};
