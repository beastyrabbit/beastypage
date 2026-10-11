/**
 * Font stacks for the show looks. The CSS variables are provided by
 * `app/single-cat-stream/obs/lookFonts.ts` (next/font) on the overlay page
 * and the dev preview; everywhere else the fallbacks apply.
 */
export const LOOK_FONT_BOOK =
  'var(--font-look-book, "EB Garamond"), "Iowan Old Style", Palatino, Georgia, serif';
export const LOOK_FONT_DISPLAY =
  'var(--font-look-display, "Cormorant Garamond"), "Iowan Old Style", Palatino, Georgia, serif';
export const LOOK_FONT_PIXEL =
  'var(--font-look-pixel, "Press Start 2P"), "Departure Mono", ui-monospace, monospace';
export const LOOK_FONT_MONO =
  'var(--font-look-mono, "IBM Plex Mono"), ui-monospace, Menlo, Consolas, monospace';
export const LOOK_FONT_HAND =
  'var(--font-look-hand, Caveat), "Segoe Print", "Comic Sans MS", cursive';
export const LOOK_FONT_TYPEWRITER =
  'var(--font-look-type, "Special Elite"), "Courier New", Courier, monospace';
export const LOOK_FONT_SANS =
  '"Helvetica Neue", Inter, "Segoe UI", Arial, sans-serif';
