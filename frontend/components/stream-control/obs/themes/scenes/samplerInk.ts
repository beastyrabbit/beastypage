/**
 * Pick black or white "×" ink for a thread swatch. Understands #rgb,
 * #rrggbb(aa) and rgb()/rgba(); anything else gets the sheet's dark ink.
 */
export function samplerGlyphInk(colour: string): string {
  const rgb = parseColour(colour);
  if (!rgb) return "#2a2622";
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.35 ? "#000000" : "#ffffff";
}

function parseColour(colour: string): [number, number, number] | null {
  const value = colour.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(value)?.[1];
  if (hex) {
    if (hex.length === 3 || hex.length === 4) {
      return [0, 1, 2].map((i) => Number.parseInt(hex[i] + hex[i], 16)) as [
        number,
        number,
        number,
      ];
    }
    if (hex.length === 6 || hex.length === 8) {
      return [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [
        number,
        number,
        number,
      ];
    }
    return null;
  }
  const rgb = /^rgba?\(([^)]+)\)$/.exec(value)?.[1];
  if (rgb) {
    const parts = rgb
      .split(/[\s,/]+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((p) => Number.parseFloat(p));
    if (parts.length === 3 && parts.every((p) => Number.isFinite(p))) {
      return parts as [number, number, number];
    }
  }
  return null;
}
