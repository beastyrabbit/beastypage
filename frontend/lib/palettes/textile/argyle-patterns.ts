import type { PaletteCategory } from '../types';

export const argylePatternsPalette: PaletteCategory = {
  id: 'argyle-patterns',
  label: 'Argyle Patterns',
  description:
    'Diamond lattice with diagonal lines at 3 scales — fine, medium, and bold',
  colors: {
    AG_PREPPY_FINE: {
      pattern: { type: 'argyle', tileSize: 8, background: [18, 22, 65], foreground: [180, 45, 55], stripes: [
          { color: [200, 200, 210], width: 1, offset: 0 },
        ] },
    },
    AG_PREPPY_MED: {
      pattern: { type: 'argyle', tileSize: 14, background: [18, 22, 65], foreground: [180, 45, 55], stripes: [
          { color: [200, 200, 210], width: 1, offset: 0 },
        ] },
    },
    AG_PREPPY_BOLD: {
      pattern: { type: 'argyle', tileSize: 22, background: [18, 22, 65], foreground: [180, 45, 55], stripes: [
          { color: [200, 200, 210], width: 1, offset: 0 },
        ] },
    },
    AG_GOLF_FINE: {
      pattern: { type: 'argyle', tileSize: 8, background: [240, 235, 220], foreground: [25, 100, 50], stripes: [
          { color: [200, 180, 100], width: 1, offset: 0 },
        ] },
    },
    AG_GOLF_MED: {
      pattern: { type: 'argyle', tileSize: 14, background: [240, 235, 220], foreground: [25, 100, 50], stripes: [
          { color: [200, 180, 100], width: 1, offset: 0 },
        ] },
    },
    AG_GOLF_BOLD: {
      pattern: { type: 'argyle', tileSize: 22, background: [240, 235, 220], foreground: [25, 100, 50], stripes: [
          { color: [200, 180, 100], width: 1, offset: 0 },
        ] },
    },
    AG_GREY_FINE: {
      pattern: { type: 'argyle', tileSize: 8, background: [200, 200, 205], foreground: [80, 80, 85], stripes: [
          { color: [160, 160, 165], width: 1, offset: 0 },
        ] },
    },
    AG_GREY_MED: {
      pattern: { type: 'argyle', tileSize: 14, background: [200, 200, 205], foreground: [80, 80, 85], stripes: [
          { color: [160, 160, 165], width: 1, offset: 0 },
        ] },
    },
    AG_GREY_BOLD: {
      pattern: { type: 'argyle', tileSize: 22, background: [200, 200, 205], foreground: [80, 80, 85], stripes: [
          { color: [160, 160, 165], width: 1, offset: 0 },
        ] },
    },
    AG_BURGUNDY_FINE: {
      pattern: { type: 'argyle', tileSize: 8, background: [100, 15, 30], foreground: [200, 180, 60], stripes: [
          { color: [180, 160, 140], width: 1, offset: 0 },
        ] },
    },
    AG_BURGUNDY_MED: {
      pattern: { type: 'argyle', tileSize: 14, background: [100, 15, 30], foreground: [200, 180, 60], stripes: [
          { color: [180, 160, 140], width: 1, offset: 0 },
        ] },
    },
    AG_BURGUNDY_BOLD: {
      pattern: { type: 'argyle', tileSize: 22, background: [100, 15, 30], foreground: [200, 180, 60], stripes: [
          { color: [180, 160, 140], width: 1, offset: 0 },
        ] },
    },
    AG_PINK_FINE: {
      pattern: { type: 'argyle', tileSize: 8, background: [245, 210, 220], foreground: [190, 60, 100], stripes: [
          { color: [220, 180, 195], width: 1, offset: 0 },
        ] },
    },
    AG_PINK_MED: {
      pattern: { type: 'argyle', tileSize: 14, background: [245, 210, 220], foreground: [190, 60, 100], stripes: [
          { color: [220, 180, 195], width: 1, offset: 0 },
        ] },
    },
    AG_PINK_BOLD: {
      pattern: { type: 'argyle', tileSize: 22, background: [245, 210, 220], foreground: [190, 60, 100], stripes: [
          { color: [220, 180, 195], width: 1, offset: 0 },
        ] },
    },
  },
};
