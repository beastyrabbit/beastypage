import type { PaletteCategory } from '../types';

export const ginghamPatternsPalette: PaletteCategory = {
  id: 'gingham-patterns',
  label: 'Gingham Patterns',
  description:
    'Classic gingham checks at 3 scales — fine (tight check), medium, and bold (big blocks)',
  colors: {
    GP_RED_FINE: {
      pattern: { type: 'gingham', tileSize: 4, background: [200, 30, 30], foreground: [245, 235, 230] },
    },
    GP_RED_MED: {
      pattern: { type: 'gingham', tileSize: 10, background: [200, 30, 30], foreground: [245, 235, 230] },
    },
    GP_RED_BOLD: {
      pattern: { type: 'gingham', tileSize: 18, background: [200, 30, 30], foreground: [245, 235, 230] },
    },
    GP_BLUE_FINE: {
      pattern: { type: 'gingham', tileSize: 4, background: [30, 60, 160], foreground: [235, 235, 245] },
    },
    GP_BLUE_MED: {
      pattern: { type: 'gingham', tileSize: 10, background: [30, 60, 160], foreground: [235, 235, 245] },
    },
    GP_BLUE_BOLD: {
      pattern: { type: 'gingham', tileSize: 18, background: [30, 60, 160], foreground: [235, 235, 245] },
    },
    GP_GREEN_FINE: {
      pattern: { type: 'gingham', tileSize: 4, background: [25, 110, 45], foreground: [230, 240, 230] },
    },
    GP_GREEN_MED: {
      pattern: { type: 'gingham', tileSize: 10, background: [25, 110, 45], foreground: [230, 240, 230] },
    },
    GP_GREEN_BOLD: {
      pattern: { type: 'gingham', tileSize: 18, background: [25, 110, 45], foreground: [230, 240, 230] },
    },
    GP_BLACK_FINE: {
      pattern: { type: 'gingham', tileSize: 4, background: [20, 20, 20], foreground: [235, 235, 235] },
    },
    GP_BLACK_MED: {
      pattern: { type: 'gingham', tileSize: 10, background: [20, 20, 20], foreground: [235, 235, 235] },
    },
    GP_BLACK_BOLD: {
      pattern: { type: 'gingham', tileSize: 18, background: [20, 20, 20], foreground: [235, 235, 235] },
    },
    GP_PINK_FINE: {
      pattern: { type: 'gingham', tileSize: 4, background: [220, 90, 130], foreground: [248, 235, 240] },
    },
    GP_PINK_MED: {
      pattern: { type: 'gingham', tileSize: 10, background: [220, 90, 130], foreground: [248, 235, 240] },
    },
    GP_PINK_BOLD: {
      pattern: { type: 'gingham', tileSize: 18, background: [220, 90, 130], foreground: [248, 235, 240] },
    },
  },
};
