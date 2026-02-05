import sharp from "sharp";

/**
 * Floyd–Steinberg error diffusion dithering.
 * Distributes quantization error to neighboring pixels: 7/16, 3/16, 5/16, 1/16.
 */
export async function ditherFloydSteinberg(
  buffer: Buffer,
  params: Record<string, unknown>,
): Promise<Buffer> {
  const levels = Math.max(2, Math.min(32, Math.round(Number(params.levels) || 4)));

  const image = sharp(buffer).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  // Use float array for error accumulation
  const pixels = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) {
    pixels[i] = data[i]!;
  }

  const step = 255 / (levels - 1);

  function quantize(val: number): number {
    return Math.round(Math.max(0, Math.min(255, val)) / step) * step;
  }

  function addError(x: number, y: number, c: number, error: number) {
    if (x < 0 || x >= w || y >= h) return;
    const idx = (y * w + x) * 4 + c;
    pixels[idx] = pixels[idx]! + error;
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;

      for (let c = 0; c < 3; c++) {
        const old = pixels[idx + c]!;
        const quantized = quantize(old);
        pixels[idx + c] = quantized;
        const error = old - quantized;

        addError(x + 1, y, c, error * 7 / 16);
        addError(x - 1, y + 1, c, error * 3 / 16);
        addError(x, y + 1, c, error * 5 / 16);
        addError(x + 1, y + 1, c, error * 1 / 16);
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
