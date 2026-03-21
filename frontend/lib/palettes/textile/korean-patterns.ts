import type { PaletteCategory } from '../types';

export const koreanPatternsPalette: PaletteCategory = {
  id: 'korean-patterns',
  label: 'Korean Patterns',
  description:
    'Traditional Korean dancheong — concentric painted squares from temple architecture',
  colors: {
    // Dancheong — red and green (classic temple)
    KR_DANCHEONG_TEMPLE_FINE: {
      pattern: { type: 'dancheong', tileSize: 8, background: [185, 32, 35], foreground: [28, 105, 55] },
    },
    KR_DANCHEONG_TEMPLE_MED: {
      pattern: { type: 'dancheong', tileSize: 14, background: [185, 32, 35], foreground: [28, 105, 55] },
    },
    KR_DANCHEONG_TEMPLE_BOLD: {
      pattern: { type: 'dancheong', tileSize: 22, background: [185, 32, 35], foreground: [28, 105, 55] },
    },
    // Dancheong — blue and gold (royal palace)
    KR_DANCHEONG_PALACE_FINE: {
      pattern: { type: 'dancheong', tileSize: 8, background: [18, 42, 95], foreground: [210, 175, 55] },
    },
    KR_DANCHEONG_PALACE_MED: {
      pattern: { type: 'dancheong', tileSize: 14, background: [18, 42, 95], foreground: [210, 175, 55] },
    },
    KR_DANCHEONG_PALACE_BOLD: {
      pattern: { type: 'dancheong', tileSize: 22, background: [18, 42, 95], foreground: [210, 175, 55] },
    },
    // Dancheong — celadon green and cream (ceramic inspired)
    KR_DANCHEONG_CELADON_FINE: {
      pattern: { type: 'dancheong', tileSize: 8, background: [232, 228, 218], foreground: [95, 148, 115] },
    },
    KR_DANCHEONG_CELADON_MED: {
      pattern: { type: 'dancheong', tileSize: 14, background: [232, 228, 218], foreground: [95, 148, 115] },
    },
    KR_DANCHEONG_CELADON_BOLD: {
      pattern: { type: 'dancheong', tileSize: 22, background: [232, 228, 218], foreground: [95, 148, 115] },
    },
  },
};
