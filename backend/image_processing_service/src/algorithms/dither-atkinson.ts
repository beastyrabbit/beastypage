import sharp from "sharp";

/**
 * Atkinson dithering. Similar to Floyd–Steinberg but distributes only 6/8 of the error
 * to 6 neighbors, producing a lighter, more "retro" look.
 */
export async function ditherAtkinson(
  buffer: Buffer,
  params: Record<string, unknown>,
): Promise<Buffer> {
  const levels = Math.max(2, Math.min(32, Math.round(Number(params.levels) || 4)));

  const image = sharp(buffer).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const pixels = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) {
    pixels[i] = data[i]!;
  }

  const step = 255 / (levels - 1);

  function quantize(val: number): number {
    return Math.round(Math.max(0, Math.min(255, val)) / step) * step;
  }

  function addError(x: number, y: number, c: number, fraction: number) {
    if (x < 0 || x >= w || y >= h) return;
    const idx = (y * w + x) * 4 + c;
    pixels[idx] = pixels[idx]! + fraction;
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;

      for (let c = 0; c < 3; c++) {
        const old = pixels[idx + c]!;
        const quantized = quantize(old);
        pixels[idx + c] = quantized;
        const err = (old - quantized) / 8;

        // Atkinson distributes 6/8 of error to 6 neighbors
        addError(x + 1, y, c, err);
        addError(x + 2, y, c, err);
        addError(x - 1, y + 1, c, err);
        addError(x, y + 1, c, err);
        addError(x + 1, y + 1, c, err);
        addError(x, y + 2, c, err);
      }
    }
  }

  const output = new Uint8Array(data.length);
  for (let i = 0; i < pixels.length; i++) {
    output[i] = Math.max(0, Math.min(255, Math.round(pixels[i]!)));
  }

  return sharp(output, {
    raw: { width: w, height: h, channels: 4 },
  })
    .png()
    .toBuffer();
}
