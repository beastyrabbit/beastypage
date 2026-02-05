import sharp from "sharp";

/**
 * Median-cut color quantization. Reduces the color palette of an image
 * to a specified number of colors using sharp's built-in palette option.
 */
export async function quantize(
  buffer: Buffer,
  params: Record<string, unknown>,
): Promise<Buffer> {
  const colors = Math.max(2, Math.min(256, Math.round(Number(params.colors) || 16)));
  const dither = params.dither !== false ? 1.0 : 0;

  return sharp(buffer)
    .png({ palette: true, colours: colors, dither })
    .toBuffer();
}
