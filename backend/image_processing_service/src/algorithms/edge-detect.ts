import sharp from "sharp";

/**
 * Sobel edge detection. Applies horizontal and vertical convolution kernels
 * and combines the magnitudes.
 */
export async function edgeDetect(
  buffer: Buffer,
  params: Record<string, unknown>,
): Promise<Buffer> {
  const threshold = Math.max(0, Math.min(255, Math.round(Number(params.threshold) || 30)));
  const invert = params.invert === true;

  const image = sharp(buffer).greyscale().ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const src = new Uint8Array(data.buffer);

  const w = info.width;
  const h = info.height;
  // Source is greyscale + alpha = 2 channels after ensureAlpha...
  // Actually sharp greyscale().ensureAlpha() gives 2 channels
  // Let's use a different approach: convert to greyscale first, then process
  const greyImage = sharp(buffer).greyscale();
  const { data: greyData, info: greyInfo } = await greyImage.raw().toBuffer({ resolveWithObject: true });
  const grey = new Uint8Array(greyData.buffer);

  const gw = greyInfo.width;
  const gh = greyInfo.height;
  const channels = greyInfo.channels; // 1 for greyscale
  const out = new Uint8Array(gw * gh * 4);

  function getGrey(x: number, y: number): number {
    const cx = Math.max(0, Math.min(gw - 1, x));
    const cy = Math.max(0, Math.min(gh - 1, y));
    return grey[cy * gw * channels + cx * channels]!;
  }

  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      // Sobel kernels
      const gx =
        -getGrey(x - 1, y - 1) + getGrey(x + 1, y - 1) +
        -2 * getGrey(x - 1, y) + 2 * getGrey(x + 1, y) +
        -getGrey(x - 1, y + 1) + getGrey(x + 1, y + 1);

      const gy =
        -getGrey(x - 1, y - 1) - 2 * getGrey(x, y - 1) - getGrey(x + 1, y - 1) +
        getGrey(x - 1, y + 1) + 2 * getGrey(x, y + 1) + getGrey(x + 1, y + 1);

      let magnitude = Math.sqrt(gx * gx + gy * gy);
      magnitude = magnitude > threshold ? Math.min(255, magnitude) : 0;

      if (invert) magnitude = 255 - magnitude;

      const idx = (y * gw + x) * 4;
      out[idx] = magnitude;
      out[idx + 1] = magnitude;
      out[idx + 2] = magnitude;
      out[idx + 3] = 255;
    }
  }

  return sharp(out, {
    raw: { width: gw, height: gh, channels: 4 },
  })
    .png()
    .toBuffer();
}
