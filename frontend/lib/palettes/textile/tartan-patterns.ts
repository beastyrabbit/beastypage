import type { PaletteCategory } from '../types';

export const tartanPatternsPalette: PaletteCategory = {
  id: 'tartan-patterns',
  label: 'Tartan Patterns',
  description:
    'Classic Scottish tartans at 3 scales — fine (tight weave), medium, and bold (zoomed in)',
  colors: {
    TP_STEWART_FINE: {
      pattern: {
        type: 'tartan', tileSize: 8, background: [178, 22, 28],
        stripes: [
          { color: [18, 78, 32], width: 2, offset: 0 },
          { color: [22, 30, 105], width: 1, offset: 4 },
          { color: [205, 170, 35], width: 1, offset: 6 },
        ],
      },
    },
    TP_STEWART_MED: {
      pattern: {
        type: 'tartan', tileSize: 14, background: [178, 22, 28],
        stripes: [
          { color: [18, 78, 32], width: 3, offset: 0 },
          { color: [22, 30, 105], width: 2, offset: 7 },
          { color: [205, 170, 35], width: 1, offset: 11 },
        ],
      },
    },
    TP_STEWART_BOLD: {
      pattern: {
        type: 'tartan', tileSize: 22, background: [178, 22, 28],
        stripes: [
          { color: [18, 78, 32], width: 4, offset: 0 },
          { color: [22, 30, 105], width: 3, offset: 11 },
          { color: [205, 170, 35], width: 2, offset: 18 },
        ],
      },
    },
    TP_BLACKWATCH_FINE: {
      pattern: {
        type: 'tartan', tileSize: 8, background: [18, 68, 38],
        stripes: [
          { color: [25, 32, 98], width: 2, offset: 0 },
          { color: [10, 12, 14], width: 1, offset: 5 },
        ],
      },
    },
    TP_BLACKWATCH_MED: {
      pattern: {
        type: 'tartan', tileSize: 14, background: [18, 68, 38],
        stripes: [
          { color: [25, 32, 98], width: 3, offset: 0 },
          { color: [10, 12, 14], width: 2, offset: 8 },
        ],
      },
    },
    TP_BLACKWATCH_BOLD: {
      pattern: {
        type: 'tartan', tileSize: 22, background: [18, 68, 38],
        stripes: [
          { color: [25, 32, 98], width: 5, offset: 0 },
          { color: [10, 12, 14], width: 3, offset: 13 },
        ],
      },
    },
    TP_DRESSGORDON_FINE: {
      pattern: {
        type: 'tartan', tileSize: 8, background: [240, 238, 225],
        stripes: [
          { color: [22, 30, 105], width: 2, offset: 0 },
          { color: [18, 78, 32], width: 1, offset: 4 },
          { color: [205, 170, 35], width: 1, offset: 6 },
        ],
      },
    },
    TP_DRESSGORDON_MED: {
      pattern: {
        type: 'tartan', tileSize: 14, background: [240, 238, 225],
        stripes: [
          { color: [22, 30, 105], width: 3, offset: 0 },
          { color: [18, 78, 32], width: 2, offset: 6 },
          { color: [205, 170, 35], width: 1, offset: 11 },
        ],
      },
    },
    TP_DRESSGORDON_BOLD: {
      pattern: {
        type: 'tartan', tileSize: 22, background: [240, 238, 225],
        stripes: [
          { color: [22, 30, 105], width: 5, offset: 0 },
          { color: [18, 78, 32], width: 3, offset: 10 },
          { color: [205, 170, 35], width: 2, offset: 17 },
        ],
      },
    },
    TP_MACLEOD_FINE: {
      pattern: {
        type: 'tartan', tileSize: 8, background: [228, 192, 48],
        stripes: [
          { color: [10, 10, 10], width: 2, offset: 0 },
          { color: [10, 10, 10], width: 1, offset: 5 },
        ],
      },
    },
    TP_MACLEOD_MED: {
      pattern: {
        type: 'tartan', tileSize: 14, background: [228, 192, 48],
        stripes: [
          { color: [10, 10, 10], width: 3, offset: 0 },
          { color: [10, 10, 10], width: 2, offset: 8 },
        ],
      },
    },
    TP_MACLEOD_BOLD: {
      pattern: {
        type: 'tartan', tileSize: 22, background: [228, 192, 48],
        stripes: [
          { color: [10, 10, 10], width: 4, offset: 0 },
          { color: [10, 10, 10], width: 3, offset: 13 },
        ],
      },
    },
    TP_HUNTING_FINE: {
      pattern: {
        type: 'tartan', tileSize: 8, background: [35, 85, 35],
        stripes: [
          { color: [12, 12, 48], width: 2, offset: 0 },
          { color: [120, 80, 20], width: 1, offset: 5 },
        ],
      },
    },
    TP_HUNTING_MED: {
      pattern: {
        type: 'tartan', tileSize: 14, background: [35, 85, 35],
        stripes: [
          { color: [12, 12, 48], width: 3, offset: 0 },
          { color: [120, 80, 20], width: 2, offset: 7 },
          { color: [10, 10, 10], width: 1, offset: 12 },
        ],
      },
    },
    TP_HUNTING_BOLD: {
      pattern: {
        type: 'tartan', tileSize: 22, background: [35, 85, 35],
        stripes: [
          { color: [12, 12, 48], width: 5, offset: 0 },
          { color: [120, 80, 20], width: 3, offset: 11 },
          { color: [10, 10, 10], width: 2, offset: 18 },
        ],
      },
    },
  },
};
