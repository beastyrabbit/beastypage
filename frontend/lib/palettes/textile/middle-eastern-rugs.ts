import type { PaletteCategory } from '../types';

export const middleEasternRugsPalette: PaletteCategory = {
  id: 'middle-eastern-rugs',
  label: 'Middle Eastern Rugs',
  description:
    'Persian carpets, kilim weaves, Moroccan tiles, and Bedouin textiles — deep crimsons, lapis blues, saffron golds',
  colors: {
    // Persian medallion — crimson and navy diamond lattice with gold thread
    ME_PERSIAN_FINE: {
      pattern: {
        type: 'argyle', tileSize: 8, background: [138, 15, 22], foreground: [15, 18, 65],
        stripes: [{ color: [200, 165, 38], width: 1, offset: 0 }],
      },
    },
    ME_PERSIAN_MED: {
      pattern: {
        type: 'argyle', tileSize: 14, background: [138, 15, 22], foreground: [15, 18, 65],
        stripes: [{ color: [200, 165, 38], width: 1, offset: 0 }],
      },
    },
    ME_PERSIAN_BOLD: {
      pattern: {
        type: 'argyle', tileSize: 22, background: [138, 15, 22], foreground: [15, 18, 65],
        stripes: [{ color: [200, 165, 38], width: 1, offset: 0 }],
      },
    },
    // Isfahan garden — lapis blue argyle with turquoise and gold accents
    ME_ISFAHAN_FINE: {
      pattern: {
        type: 'argyle', tileSize: 8, background: [18, 28, 88], foreground: [28, 112, 108],
        stripes: [{ color: [195, 160, 42], width: 1, offset: 0 }],
      },
    },
    ME_ISFAHAN_MED: {
      pattern: {
        type: 'argyle', tileSize: 14, background: [18, 28, 88], foreground: [28, 112, 108],
        stripes: [{ color: [195, 160, 42], width: 1, offset: 0 }],
      },
    },
    ME_ISFAHAN_BOLD: {
      pattern: {
        type: 'argyle', tileSize: 22, background: [18, 28, 88], foreground: [28, 112, 108],
        stripes: [{ color: [195, 160, 42], width: 1, offset: 0 }],
      },
    },
    // Kilim flatweave — terracotta and ivory basketweave
    ME_KILIM_FINE: {
      pattern: { type: 'basketweave', tileSize: 6, background: [172, 78, 38], foreground: [232, 222, 195] },
    },
    ME_KILIM_MED: {
      pattern: { type: 'basketweave', tileSize: 12, background: [172, 78, 38], foreground: [232, 222, 195] },
    },
    ME_KILIM_BOLD: {
      pattern: { type: 'basketweave', tileSize: 20, background: [172, 78, 38], foreground: [232, 222, 195] },
    },
    // Turkish carpet — deep red and teal houndstooth (Anatolian geometric)
    ME_TURKISH_FINE: {
      pattern: { type: 'houndstooth', tileSize: 6, background: [155, 18, 28], foreground: [25, 90, 88] },
    },
    ME_TURKISH_MED: {
      pattern: { type: 'houndstooth', tileSize: 12, background: [155, 18, 28], foreground: [25, 90, 88] },
    },
    ME_TURKISH_BOLD: {
      pattern: { type: 'houndstooth', tileSize: 20, background: [155, 18, 28], foreground: [25, 90, 88] },
    },
    // Zellige tile — Moroccan navy and gold checkerboard
    ME_ZELLIGE_FINE: {
      pattern: { type: 'checkerboard', tileSize: 4, background: [12, 22, 62], foreground: [208, 172, 52] },
    },
    ME_ZELLIGE_MED: {
      pattern: { type: 'checkerboard', tileSize: 10, background: [12, 22, 62], foreground: [208, 172, 52] },
    },
    ME_ZELLIGE_BOLD: {
      pattern: { type: 'checkerboard', tileSize: 18, background: [12, 22, 62], foreground: [208, 172, 52] },
    },
    // Riad courtyard — turquoise and white windowpane (Moroccan grillwork)
    ME_RIAD_FINE: {
      pattern: { type: 'windowpane', tileSize: 6, background: [240, 238, 228], foreground: [22, 118, 112] },
    },
    ME_RIAD_MED: {
      pattern: { type: 'windowpane', tileSize: 12, background: [240, 238, 228], foreground: [22, 118, 112] },
    },
    ME_RIAD_BOLD: {
      pattern: { type: 'windowpane', tileSize: 20, background: [240, 238, 228], foreground: [22, 118, 112] },
    },
    // Bedouin tent stripe — ochre and dark earth diagonals
    ME_BEDOUIN_FINE: {
      pattern: { type: 'diagonal', tileSize: 50, background: [165, 105, 45], foreground: [48, 25, 15], spacing: 4 },
    },
    ME_BEDOUIN_MED: {
      pattern: { type: 'diagonal', tileSize: 50, background: [165, 105, 45], foreground: [48, 25, 15], spacing: 7 },
    },
    ME_BEDOUIN_BOLD: {
      pattern: { type: 'diagonal', tileSize: 50, background: [165, 105, 45], foreground: [48, 25, 15], spacing: 12 },
    },
    // Bazaar tartan — saffron base with crimson and indigo threads
    ME_BAZAAR_FINE: {
      pattern: {
        type: 'tartan', tileSize: 8, background: [195, 155, 42],
        stripes: [
          { color: [140, 15, 22], width: 2, offset: 0 },
          { color: [18, 22, 72], width: 1, offset: 5 },
        ],
      },
    },
    ME_BAZAAR_MED: {
      pattern: {
        type: 'tartan', tileSize: 14, background: [195, 155, 42],
        stripes: [
          { color: [140, 15, 22], width: 3, offset: 0 },
          { color: [18, 22, 72], width: 2, offset: 7 },
        ],
      },
    },
    ME_BAZAAR_BOLD: {
      pattern: {
        type: 'tartan', tileSize: 22, background: [195, 155, 42],
        stripes: [
          { color: [140, 15, 22], width: 5, offset: 0 },
          { color: [18, 22, 72], width: 3, offset: 12 },
        ],
      },
    },
    // Souk polkadot — deep burgundy with gold medallion dots
    ME_SOUK_FINE: {
      pattern: { type: 'polkadot', tileSize: 6, background: [85, 15, 28], foreground: [210, 175, 55] },
    },
    ME_SOUK_MED: {
      pattern: { type: 'polkadot', tileSize: 12, background: [85, 15, 28], foreground: [210, 175, 55] },
    },
    ME_SOUK_BOLD: {
      pattern: { type: 'polkadot', tileSize: 20, background: [85, 15, 28], foreground: [210, 175, 55] },
    },
    // Khamsa chevron — protective eye motif (indigo/ivory zigzag)
    ME_KHAMSA_FINE: {
      pattern: { type: 'chevron', tileSize: 50, background: [22, 32, 75], foreground: [232, 225, 205], spacing: 4 },
    },
    ME_KHAMSA_MED: {
      pattern: { type: 'chevron', tileSize: 50, background: [22, 32, 75], foreground: [232, 225, 205], spacing: 7 },
    },
    ME_KHAMSA_BOLD: {
      pattern: { type: 'chevron', tileSize: 50, background: [22, 32, 75], foreground: [232, 225, 205], spacing: 12 },
    },
    // Islamic star — eight-pointed star zellige (deep teal / gold)
    ME_STAR_FINE: {
      pattern: { type: 'islamic_star', tileSize: 8, background: [12, 52, 58], foreground: [210, 175, 55] },
    },
    ME_STAR_MED: {
      pattern: { type: 'islamic_star', tileSize: 16, background: [12, 52, 58], foreground: [210, 175, 55] },
    },
    ME_STAR_BOLD: {
      pattern: { type: 'islamic_star', tileSize: 24, background: [12, 52, 58], foreground: [210, 175, 55] },
    },
    // Islamic star — lapis and ivory variant (Moroccan zellige)
    ME_ZELLIGE_STAR_FINE: {
      pattern: { type: 'islamic_star', tileSize: 8, background: [18, 28, 88], foreground: [235, 230, 215] },
    },
    ME_ZELLIGE_STAR_MED: {
      pattern: { type: 'islamic_star', tileSize: 16, background: [18, 28, 88], foreground: [235, 230, 215] },
    },
    ME_ZELLIGE_STAR_BOLD: {
      pattern: { type: 'islamic_star', tileSize: 24, background: [18, 28, 88], foreground: [235, 230, 215] },
    },
  },
};
