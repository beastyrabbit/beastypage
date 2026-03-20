import type { PaletteCategory } from '../types';

export const diagonalPatternsPalette: PaletteCategory = {
  id: 'diagonal-patterns',
  label: 'Diagonal Stripe Patterns',
  description:
    'Angled stripes — regimental ties and barbershop at 3 widths — fine, medium, and bold',
  colors: {
    DS_REGIMENT_FINE: {
      pattern: { type: 'diagonal', tileSize: 50, background: [18, 22, 65], foreground: [180, 35, 35], spacing: 3 },
    },
    DS_REGIMENT_MED: {
      pattern: { type: 'diagonal', tileSize: 50, background: [18, 22, 65], foreground: [180, 35, 35], spacing: 6 },
    },
    DS_REGIMENT_BOLD: {
      pattern: { type: 'diagonal', tileSize: 50, background: [18, 22, 65], foreground: [180, 35, 35], spacing: 12 },
    },
    DS_SCHOOL_FINE: {
      pattern: { type: 'diagonal', tileSize: 50, background: [120, 15, 25], foreground: [220, 185, 40], spacing: 3 },
    },
    DS_SCHOOL_MED: {
      pattern: { type: 'diagonal', tileSize: 50, background: [120, 15, 25], foreground: [220, 185, 40], spacing: 6 },
    },
    DS_SCHOOL_BOLD: {
      pattern: { type: 'diagonal', tileSize: 50, background: [120, 15, 25], foreground: [220, 185, 40], spacing: 12 },
    },
    DS_BARBER_FINE: {
      pattern: { type: 'diagonal', tileSize: 50, background: [240, 240, 240], foreground: [200, 30, 30], spacing: 3 },
    },
    DS_BARBER_MED: {
      pattern: { type: 'diagonal', tileSize: 50, background: [240, 240, 240], foreground: [200, 30, 30], spacing: 6 },
    },
    DS_BARBER_BOLD: {
      pattern: { type: 'diagonal', tileSize: 50, background: [240, 240, 240], foreground: [200, 30, 30], spacing: 12 },
    },
    DS_PREPPY_FINE: {
      pattern: { type: 'diagonal', tileSize: 50, background: [15, 80, 45], foreground: [240, 235, 225], spacing: 3 },
    },
    DS_PREPPY_MED: {
      pattern: { type: 'diagonal', tileSize: 50, background: [15, 80, 45], foreground: [240, 235, 225], spacing: 6 },
    },
    DS_PREPPY_BOLD: {
      pattern: { type: 'diagonal', tileSize: 50, background: [15, 80, 45], foreground: [240, 235, 225], spacing: 12 },
    },
    DS_GREY_FINE: {
      pattern: { type: 'diagonal', tileSize: 50, background: [60, 60, 65], foreground: [180, 180, 185], spacing: 3 },
    },
    DS_GREY_MED: {
      pattern: { type: 'diagonal', tileSize: 50, background: [60, 60, 65], foreground: [180, 180, 185], spacing: 6 },
    },
    DS_GREY_BOLD: {
      pattern: { type: 'diagonal', tileSize: 50, background: [60, 60, 65], foreground: [180, 180, 185], spacing: 12 },
    },
  },
};
