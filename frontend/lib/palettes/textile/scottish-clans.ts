import type { PaletteCategory } from '../types';

export const scottishClansPalette: PaletteCategory = {
  id: 'scottish-clans',
  label: 'Scottish Heritage',
  description:
    'Scottish textiles — Saltire blues, clan tartans, Fair Isle knits, and Harris Tweed',
  colors: {
    // Saltire — St. Andrew's Cross: deep blue and white diagonal
    SC_SALTIRE_FINE: {
      pattern: { type: 'diagonal', tileSize: 50, background: [0, 48, 135], foreground: [240, 240, 245], spacing: 4 },
    },
    SC_SALTIRE_MED: {
      pattern: { type: 'diagonal', tileSize: 50, background: [0, 48, 135], foreground: [240, 240, 245], spacing: 7 },
    },
    SC_SALTIRE_BOLD: {
      pattern: { type: 'diagonal', tileSize: 50, background: [0, 48, 135], foreground: [240, 240, 245], spacing: 12 },
    },
    // Flower of Scotland — blue/white gingham with heathery tones
    SC_HEATHER_FINE: {
      pattern: { type: 'gingham', tileSize: 6, background: [55, 68, 130], foreground: [210, 200, 225] },
    },
    SC_HEATHER_MED: {
      pattern: { type: 'gingham', tileSize: 12, background: [55, 68, 130], foreground: [210, 200, 225] },
    },
    SC_HEATHER_BOLD: {
      pattern: { type: 'gingham', tileSize: 20, background: [55, 68, 130], foreground: [210, 200, 225] },
    },
    // Fair Isle — traditional knitting argyle (cream / sky blue / rust)
    SC_FAIRISLE_FINE: {
      pattern: {
        type: 'argyle', tileSize: 8, background: [228, 220, 195], foreground: [45, 85, 135],
        stripes: [{ color: [165, 62, 38], width: 1, offset: 0 }],
      },
    },
    SC_FAIRISLE_MED: {
      pattern: {
        type: 'argyle', tileSize: 14, background: [228, 220, 195], foreground: [45, 85, 135],
        stripes: [{ color: [165, 62, 38], width: 1, offset: 0 }],
      },
    },
    SC_FAIRISLE_BOLD: {
      pattern: {
        type: 'argyle', tileSize: 22, background: [228, 220, 195], foreground: [45, 85, 135],
        stripes: [{ color: [165, 62, 38], width: 1, offset: 0 }],
      },
    },
    // Harris Tweed — earthy herringbone (peat brown / oatmeal)
    SC_HARRIS_FINE: {
      pattern: { type: 'chevron', tileSize: 50, background: [88, 72, 52], foreground: [175, 162, 138], spacing: 3 },
    },
    SC_HARRIS_MED: {
      pattern: { type: 'chevron', tileSize: 50, background: [88, 72, 52], foreground: [175, 162, 138], spacing: 5 },
    },
    SC_HARRIS_BOLD: {
      pattern: { type: 'chevron', tileSize: 50, background: [88, 72, 52], foreground: [175, 162, 138], spacing: 9 },
    },
    // Shetland houndstooth — stormy grey and off-white
    SC_SHETLAND_FINE: {
      pattern: { type: 'houndstooth', tileSize: 6, background: [190, 185, 175], foreground: [52, 48, 45] },
    },
    SC_SHETLAND_MED: {
      pattern: { type: 'houndstooth', tileSize: 12, background: [190, 185, 175], foreground: [52, 48, 45] },
    },
    SC_SHETLAND_BOLD: {
      pattern: { type: 'houndstooth', tileSize: 20, background: [190, 185, 175], foreground: [52, 48, 45] },
    },
    // Campbell clan — green and blue tartan (the non-red classic)
    SC_CAMPBELL_FINE: {
      pattern: {
        type: 'tartan', tileSize: 8, background: [18, 80, 42],
        stripes: [
          { color: [15, 30, 90], width: 2, offset: 0 },
          { color: [10, 10, 10], width: 1, offset: 5 },
        ],
      },
    },
    SC_CAMPBELL_MED: {
      pattern: {
        type: 'tartan', tileSize: 14, background: [18, 80, 42],
        stripes: [
          { color: [15, 30, 90], width: 3, offset: 0 },
          { color: [10, 10, 10], width: 2, offset: 8 },
        ],
      },
    },
    SC_CAMPBELL_BOLD: {
      pattern: {
        type: 'tartan', tileSize: 22, background: [18, 80, 42],
        stripes: [
          { color: [15, 30, 90], width: 5, offset: 0 },
          { color: [10, 10, 10], width: 3, offset: 13 },
        ],
      },
    },
    // Highland windowpane — moss green grid on mist grey
    SC_HIGHLAND_FINE: {
      pattern: { type: 'windowpane', tileSize: 6, background: [178, 182, 172], foreground: [55, 82, 48] },
    },
    SC_HIGHLAND_MED: {
      pattern: { type: 'windowpane', tileSize: 12, background: [178, 182, 172], foreground: [55, 82, 48] },
    },
    SC_HIGHLAND_BOLD: {
      pattern: { type: 'windowpane', tileSize: 20, background: [178, 182, 172], foreground: [55, 82, 48] },
    },
    // Edinburgh pinstripe — charcoal with pale blue thread
    SC_EDINBURGH_FINE: {
      pattern: { type: 'pinstripe', tileSize: 8, background: [42, 42, 48], foreground: [140, 165, 200], spacing: 3 },
    },
    SC_EDINBURGH_MED: {
      pattern: { type: 'pinstripe', tileSize: 8, background: [42, 42, 48], foreground: [140, 165, 200], spacing: 5 },
    },
    SC_EDINBURGH_BOLD: {
      pattern: { type: 'pinstripe', tileSize: 8, background: [42, 42, 48], foreground: [140, 165, 200], spacing: 8 },
    },
  },
};
