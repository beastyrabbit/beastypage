import type { PaletteCategory } from '../types';

export const windowpanePatternsPalette: PaletteCategory = {
  id: 'windowpane-patterns',
  label: 'Windowpane Patterns',
  description:
    'Thin grid lines on solid fabric at 3 scales — fine, medium, and bold',
  colors: {
    WN_NAVY_FINE: {
      pattern: { type: 'windowpane', tileSize: 6, background: [20, 25, 55], foreground: [160, 165, 180] },
    },
    WN_NAVY_MED: {
      pattern: { type: 'windowpane', tileSize: 12, background: [20, 25, 55], foreground: [160, 165, 180] },
    },
    WN_NAVY_BOLD: {
      pattern: { type: 'windowpane', tileSize: 20, background: [20, 25, 55], foreground: [160, 165, 180] },
    },
    WN_CHARCOAL_FINE: {
      pattern: { type: 'windowpane', tileSize: 6, background: [45, 45, 48], foreground: [140, 140, 145] },
    },
    WN_CHARCOAL_MED: {
      pattern: { type: 'windowpane', tileSize: 12, background: [45, 45, 48], foreground: [140, 140, 145] },
    },
    WN_CHARCOAL_BOLD: {
      pattern: { type: 'windowpane', tileSize: 20, background: [45, 45, 48], foreground: [140, 140, 145] },
    },
    WN_TAN_FINE: {
      pattern: { type: 'windowpane', tileSize: 6, background: [195, 175, 145], foreground: [120, 90, 55] },
    },
    WN_TAN_MED: {
      pattern: { type: 'windowpane', tileSize: 12, background: [195, 175, 145], foreground: [120, 90, 55] },
    },
    WN_TAN_BOLD: {
      pattern: { type: 'windowpane', tileSize: 20, background: [195, 175, 145], foreground: [120, 90, 55] },
    },
    WN_CREAM_FINE: {
      pattern: { type: 'windowpane', tileSize: 6, background: [240, 235, 225], foreground: [100, 110, 130] },
    },
    WN_CREAM_MED: {
      pattern: { type: 'windowpane', tileSize: 12, background: [240, 235, 225], foreground: [100, 110, 130] },
    },
    WN_CREAM_BOLD: {
      pattern: { type: 'windowpane', tileSize: 20, background: [240, 235, 225], foreground: [100, 110, 130] },
    },
    WN_BLACK_FINE: {
      pattern: { type: 'windowpane', tileSize: 6, background: [12, 12, 14], foreground: [90, 90, 95] },
    },
    WN_BLACK_MED: {
      pattern: { type: 'windowpane', tileSize: 12, background: [12, 12, 14], foreground: [90, 90, 95] },
    },
    WN_BLACK_BOLD: {
      pattern: { type: 'windowpane', tileSize: 20, background: [12, 12, 14], foreground: [90, 90, 95] },
    },
  },
};
