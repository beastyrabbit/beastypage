import type { PaletteCategory } from '../types';

export const indonesianPatternsPalette: PaletteCategory = {
  id: 'indonesian-patterns',
  label: 'Indonesian Batik',
  description:
    'Javanese batik traditions — kawung interlocking ovals and parang wavy diagonal bands',
  colors: {
    // Batik kawung — cream on deep brown (classic Javanese)
    ID_KAWUNG_CLASSIC_FINE: {
      pattern: { type: 'batik_kawung', tileSize: 8, background: [52, 28, 15], foreground: [225, 210, 180] },
    },
    ID_KAWUNG_CLASSIC_MED: {
      pattern: { type: 'batik_kawung', tileSize: 14, background: [52, 28, 15], foreground: [225, 210, 180] },
    },
    ID_KAWUNG_CLASSIC_BOLD: {
      pattern: { type: 'batik_kawung', tileSize: 22, background: [52, 28, 15], foreground: [225, 210, 180] },
    },
    // Batik kawung — gold on indigo (coastal batik)
    ID_KAWUNG_COASTAL_FINE: {
      pattern: { type: 'batik_kawung', tileSize: 8, background: [18, 28, 62], foreground: [195, 165, 55] },
    },
    ID_KAWUNG_COASTAL_MED: {
      pattern: { type: 'batik_kawung', tileSize: 14, background: [18, 28, 62], foreground: [195, 165, 55] },
    },
    ID_KAWUNG_COASTAL_BOLD: {
      pattern: { type: 'batik_kawung', tileSize: 22, background: [18, 28, 62], foreground: [195, 165, 55] },
    },
    // Batik parang — cream on soga brown (traditional wax resist)
    ID_PARANG_SOGA_FINE: {
      pattern: { type: 'batik_parang', tileSize: 8, background: [82, 48, 22], foreground: [228, 215, 185] },
    },
    ID_PARANG_SOGA_MED: {
      pattern: { type: 'batik_parang', tileSize: 16, background: [82, 48, 22], foreground: [228, 215, 185] },
    },
    ID_PARANG_SOGA_BOLD: {
      pattern: { type: 'batik_parang', tileSize: 24, background: [82, 48, 22], foreground: [228, 215, 185] },
    },
    // Batik parang — teal on cream (modern batik)
    ID_PARANG_MODERN_FINE: {
      pattern: { type: 'batik_parang', tileSize: 8, background: [235, 230, 218], foreground: [22, 88, 82] },
    },
    ID_PARANG_MODERN_MED: {
      pattern: { type: 'batik_parang', tileSize: 16, background: [235, 230, 218], foreground: [22, 88, 82] },
    },
    ID_PARANG_MODERN_BOLD: {
      pattern: { type: 'batik_parang', tileSize: 24, background: [235, 230, 218], foreground: [22, 88, 82] },
    },
  },
};
