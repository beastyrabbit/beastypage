/**
 * Palette file format generators (ACO)
 */

import type { RGB } from "./types";

export interface PaletteColor {
  rgb: RGB;
  name: string;
}

/**
 * Generate ACO binary data (Adobe Photoshop Color Swatch)
 * Writes v2-only format with color names.
 * Note: The canonical spec expects v1 blocks before v2 for backward
 * compatibility with older Photoshop versions, but v2-only files are
 * accepted by modern Adobe products.
 */
export function generateACO(colors: PaletteColor[]): ArrayBuffer {
  // ACO v2 format:
  // - Version: 2 (2 bytes, big-endian)
  // - Color count: (2 bytes, big-endian)
  // - For each color:
  //   - Color space: 0 for RGB (2 bytes)
  //   - R: 0-65535 (2 bytes)
  //   - G: 0-65535 (2 bytes)
  //   - B: 0-65535 (2 bytes)
  //   - Unused: 0 (2 bytes)
  //   - Name length: UTF-16 code units including null terminator (4 bytes, big-endian)
  //   - Name: UTF-16BE string + null terminator

  let totalSize = 4; // version (2) + count (2)
  for (const color of colors) {
    totalSize += 10; // color data
    totalSize += 4; // name length
    totalSize += (color.name.length + 1) * 2; // UTF-16BE + null
  }

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  // Version 2 header (big-endian)
  view.setUint16(0, 2, false);
  view.setUint16(2, colors.length, false);

  let offset = 4;
  for (const color of colors) {
    // Color space: 0 = RGB
    view.setUint16(offset, 0, false);
    offset += 2;

    // RGB values clamped to 0-255, scaled to 0-65535
    const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
    view.setUint16(offset, clamp(color.rgb.r) * 257, false);
    offset += 2;
    view.setUint16(offset, clamp(color.rgb.g) * 257, false);
    offset += 2;
    view.setUint16(offset, clamp(color.rgb.b) * 257, false);
    offset += 2;

    // Unused
    view.setUint16(offset, 0, false);
    offset += 2;

    // Name length (including null terminator)
    view.setUint32(offset, color.name.length + 1, false);
    offset += 4;

    // Name as UTF-16BE
    for (let i = 0; i < color.name.length; i++) {
      view.setUint16(offset, color.name.charCodeAt(i), false);
      offset += 2;
    }
    // Null terminator
    view.setUint16(offset, 0, false);
    offset += 2;
  }

  return buffer;
}

