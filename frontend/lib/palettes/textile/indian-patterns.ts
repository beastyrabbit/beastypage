import type { PaletteCategory } from '../types';

export const indianPatternsPalette: PaletteCategory = {
  id: 'indian-patterns',
  label: 'Indian Patterns',
  description:
    'South Asian textile traditions — paisley boteh, jewel-toned teardrops, and rich silk colors',
  colors: {
    // Paisley — deep crimson with gold outline (Kashmiri shawl)
    IN_PAISLEY_CRIMSON_FINE: {
      pattern: { type: 'paisley', tileSize: 14, background: [128, 12, 25], foreground: [210, 175, 55] },
    },
    IN_PAISLEY_CRIMSON_MED: {
      pattern: { type: 'paisley', tileSize: 22, background: [128, 12, 25], foreground: [210, 175, 55] },
    },
    IN_PAISLEY_CRIMSON_BOLD: {
      pattern: { type: 'paisley', tileSize: 32, background: [128, 12, 25], foreground: [210, 175, 55] },
    },
    // Paisley — midnight navy with ivory (Mughal court)
    IN_PAISLEY_NAVY_FINE: {
      pattern: { type: 'paisley', tileSize: 14, background: [15, 18, 52], foreground: [232, 225, 208] },
    },
    IN_PAISLEY_NAVY_MED: {
      pattern: { type: 'paisley', tileSize: 22, background: [15, 18, 52], foreground: [232, 225, 208] },
    },
    IN_PAISLEY_NAVY_BOLD: {
      pattern: { type: 'paisley', tileSize: 32, background: [15, 18, 52], foreground: [232, 225, 208] },
    },
    // Paisley — saffron on deep green (Rajasthani silk)
    IN_PAISLEY_SAFFRON_FINE: {
      pattern: { type: 'paisley', tileSize: 14, background: [18, 62, 38], foreground: [218, 155, 32] },
    },
    IN_PAISLEY_SAFFRON_MED: {
      pattern: { type: 'paisley', tileSize: 22, background: [18, 62, 38], foreground: [218, 155, 32] },
    },
    IN_PAISLEY_SAFFRON_BOLD: {
      pattern: { type: 'paisley', tileSize: 32, background: [18, 62, 38], foreground: [218, 155, 32] },
    },
    // Paisley — turquoise on charcoal (modern bandana)
    IN_PAISLEY_TEAL_FINE: {
      pattern: { type: 'paisley', tileSize: 14, background: [35, 35, 38], foreground: [52, 178, 165] },
    },
    IN_PAISLEY_TEAL_MED: {
      pattern: { type: 'paisley', tileSize: 22, background: [35, 35, 38], foreground: [52, 178, 165] },
    },
    IN_PAISLEY_TEAL_BOLD: {
      pattern: { type: 'paisley', tileSize: 32, background: [35, 35, 38], foreground: [52, 178, 165] },
    },
    // Kolam — woven loops on terracotta (Tamil Nadu rangoli)
    IN_KOLAM_TERRA_FINE: {
      pattern: { type: 'kolam', tileSize: 8, background: [155, 68, 35], foreground: [235, 228, 210] },
    },
    IN_KOLAM_TERRA_MED: {
      pattern: { type: 'kolam', tileSize: 14, background: [155, 68, 35], foreground: [235, 228, 210] },
    },
    IN_KOLAM_TERRA_BOLD: {
      pattern: { type: 'kolam', tileSize: 22, background: [155, 68, 35], foreground: [235, 228, 210] },
    },
    // Kolam — white on deep blue (festival)
    IN_KOLAM_BLUE_FINE: {
      pattern: { type: 'kolam', tileSize: 8, background: [18, 28, 72], foreground: [235, 232, 225] },
    },
    IN_KOLAM_BLUE_MED: {
      pattern: { type: 'kolam', tileSize: 14, background: [18, 28, 72], foreground: [235, 232, 225] },
    },
    IN_KOLAM_BLUE_BOLD: {
      pattern: { type: 'kolam', tileSize: 22, background: [18, 28, 72], foreground: [235, 232, 225] },
    },
  },
};
