import type { RGB } from "@/lib/color-extraction/types";
import {
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  rgbToHsv,
  rgbToCmyk,
  rgbToOklch,
} from "@/lib/color-extraction/color-utils";
import type { DisplayFormat } from "./types";

export function formatColor(
  hex: string,
  format: DisplayFormat,
): { display: string; clipboard: string } {
  const rgb: RGB = hexToRgb(hex);

  switch (format) {
    case "hex": {
      const val = rgbToHex(rgb).toUpperCase();
      return { display: val, clipboard: val };
    }
    case "rgb": {
      const display = `${rgb.r}, ${rgb.g}, ${rgb.b}`;
      return { display, clipboard: `rgb(${display})` };
    }
    case "hsl": {
      const hsl = rgbToHsl(rgb);
      const display = `${hsl.h}\u00B0, ${hsl.s}%, ${hsl.l}%`;
      return { display, clipboard: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)` };
    }
    case "hsv": {
      const hsv = rgbToHsv(rgb);
      const display = `${hsv.h}\u00B0, ${hsv.s}%, ${hsv.v}%`;
      return { display, clipboard: `hsv(${hsv.h}, ${hsv.s}%, ${hsv.v}%)` };
    }
    case "cmyk": {
      const cmyk = rgbToCmyk(rgb);
      const display = `${cmyk.c}, ${cmyk.m}, ${cmyk.y}, ${cmyk.k}`;
      return {
        display,
        clipboard: `cmyk(${cmyk.c}%, ${cmyk.m}%, ${cmyk.y}%, ${cmyk.k}%)`,
      };
    }
    case "oklch": {
      const oklch = rgbToOklch(rgb);
      const display = `${oklch.l}, ${oklch.c}, ${oklch.h}`;
      return { display, clipboard: `oklch(${oklch.l} ${oklch.c} ${oklch.h})` };
    }
    default: {
      const _exhaustive: never = format;
      throw new Error(`Unknown display format: ${_exhaustive}`);
    }
  }
}
