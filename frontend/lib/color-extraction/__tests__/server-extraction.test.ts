import { describe, it, expect } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import {
  getImagePixelsServer,
  extractColorsServer,
  generatePaletteImage,
} from '../server-extraction';

/** Create a small solid-color PNG as a Buffer. */
function makeSolidPng(r: number, g: number, b: number, size = 20): Buffer {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, size, size);
  return canvas.toBuffer('image/png');
}

/** Create a two-tone PNG (left half / right half). */
function makeTwoTonePng(
  r1: number, g1: number, b1: number,
  r2: number, g2: number, b2: number,
  size = 40,
): Buffer {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = `rgb(${r1},${g1},${b1})`;
  ctx.fillRect(0, 0, size / 2, size);
  ctx.fillStyle = `rgb(${r2},${g2},${b2})`;
  ctx.fillRect(size / 2, 0, size / 2, size);
  return canvas.toBuffer('image/png');
}

describe('getImagePixelsServer', () => {
  it('returns data, width, and height for a valid PNG', async () => {
    const buf = makeSolidPng(128, 64, 32);
    const result = await getImagePixelsServer(buf);
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('width');
    expect(result).toHaveProperty('height');
    expect(result.width).toBe(20);
    expect(result.height).toBe(20);
    expect(result.data).toBeInstanceOf(Uint8ClampedArray);
    expect(result.data.length).toBe(20 * 20 * 4);
  });
});

describe('extractColorsServer', () => {
  it('returns the requested number of colors from a multi-color image', async () => {
    // Use colors that are NOT near-black or near-white (they get filtered)
    const buf = makeTwoTonePng(200, 50, 50, 50, 50, 200);
    const colors = await extractColorsServer(buf, { k: 2 });
    expect(colors.length).toBe(2);
    for (const c of colors) {
      expect(c).toHaveProperty('hex');
      expect(c).toHaveProperty('rgb');
      expect(c).toHaveProperty('prevalence');
      expect(c.hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('prevalence sums close to 100', async () => {
    const buf = makeTwoTonePng(200, 50, 50, 50, 50, 200);
    const colors = await extractColorsServer(buf, { k: 2 });
    const total = colors.reduce((s, c) => s + c.prevalence, 0);
    expect(total).toBeGreaterThanOrEqual(90);
    expect(total).toBeLessThanOrEqual(110);
  });

  it('throws for a single-color image', async () => {
    const buf = makeSolidPng(128, 64, 32);
    // Only one unique color → not enough for k-means clustering
    await expect(
      extractColorsServer(buf, { k: 6, filterBlackWhite: false, sampleStep: 1 }),
    ).rejects.toThrow('Not enough unique colors');
  });
});

describe('generatePaletteImage', () => {
  it('returns a valid base64 PNG data URL', () => {
    const colors = [
      { hex: '#ff0000', rgb: { r: 255, g: 0, b: 0 } },
      { hex: '#00ff00', rgb: { r: 0, g: 255, b: 0 } },
      { hex: '#0000ff', rgb: { r: 0, g: 0, b: 255 } },
    ];
    const result = generatePaletteImage(colors);
    expect(result).toMatch(/^data:image\/png;base64,/);
    const base64Part = result.replace('data:image/png;base64,', '');
    expect(base64Part.length).toBeGreaterThan(0);
  });
});
