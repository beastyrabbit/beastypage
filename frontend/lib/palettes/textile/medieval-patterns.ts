import type { PaletteCategory } from '../types';

export const medievalPatternsPalette: PaletteCategory = {
  id: 'medieval-patterns',
  label: 'Medieval Patterns',
  description:
    'Medieval and Gothic motifs — chainmail rings, trefoil stars, Celtic weaves, damask florals, and quatrefoil crosses',
  colors: {
    // Chainmail — silver on dark iron
    MV_CHAINMAIL_FINE: {
      pattern: { type: 'chainmail', tileSize: 8, background: [28, 28, 32], foreground: [155, 160, 168] },
    },
    MV_CHAINMAIL_MED: {
      pattern: { type: 'chainmail', tileSize: 14, background: [28, 28, 32], foreground: [155, 160, 168] },
    },
    MV_CHAINMAIL_BOLD: {
      pattern: { type: 'chainmail', tileSize: 22, background: [28, 28, 32], foreground: [155, 160, 168] },
    },
    // Gothic trefoil — gold on royal purple
    MV_TREFOIL_FINE: {
      pattern: { type: 'four_point_star_motif', tileSize: 8, background: [52, 18, 72], foreground: [210, 175, 55] },
    },
    MV_TREFOIL_MED: {
      pattern: { type: 'four_point_star_motif', tileSize: 14, background: [52, 18, 72], foreground: [210, 175, 55] },
    },
    MV_TREFOIL_BOLD: {
      pattern: { type: 'four_point_star_motif', tileSize: 22, background: [52, 18, 72], foreground: [210, 175, 55] },
    },
    // Celtic knot — gold on dark green (Irish manuscript)
    MV_CELTIC_FINE: {
      pattern: { type: 'celtic_knot', tileSize: 8, background: [18, 48, 28], foreground: [195, 165, 55] },
    },
    MV_CELTIC_MED: {
      pattern: { type: 'celtic_knot', tileSize: 14, background: [18, 48, 28], foreground: [195, 165, 55] },
    },
    MV_CELTIC_BOLD: {
      pattern: { type: 'celtic_knot', tileSize: 22, background: [18, 48, 28], foreground: [195, 165, 55] },
    },
    // Damask — ivory on burgundy (tapestry)
    MV_DAMASK_FINE: {
      pattern: { type: 'damask', tileSize: 10, background: [85, 15, 28], foreground: [232, 225, 210] },
    },
    MV_DAMASK_MED: {
      pattern: { type: 'damask', tileSize: 18, background: [85, 15, 28], foreground: [232, 225, 210] },
    },
    MV_DAMASK_BOLD: {
      pattern: { type: 'damask', tileSize: 28, background: [85, 15, 28], foreground: [232, 225, 210] },
    },
    // Quatrefoil — ivory on deep blue (stained glass)
    MV_QUATREFOIL_FINE: {
      pattern: { type: 'quatrefoil', tileSize: 10, background: [15, 22, 72], foreground: [225, 220, 210] },
    },
    MV_QUATREFOIL_MED: {
      pattern: { type: 'quatrefoil', tileSize: 18, background: [15, 22, 72], foreground: [225, 220, 210] },
    },
    MV_QUATREFOIL_BOLD: {
      pattern: { type: 'quatrefoil', tileSize: 28, background: [15, 22, 72], foreground: [225, 220, 210] },
    },
  },
};
