import sharp from "sharp";

export interface NearestNeighborParams {
  blockSize: number;
}

const DEFAULT_BLOCK_SIZE = 16;

/**
 * Nearest-neighbor pixelation: both downscale and upscale use nearest-neighbor sampling.
 * Produces harder, crisper pixels than block-average.
 */
export async function nearestNeighbor(
  buffer: Buffer,
  params: Record<string, unknown>,
): Promise<Buffer> {
  const blockSize = Math.max(
    2,
    Math.min(128, Math.round(Number(params.blockSize) || DEFAULT_BLOCK_SIZE)),
  );

  const meta = await sharp(buffer).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;

  const smallW = Math.max(1, Math.round(w / blockSize));
  const smallH = Math.max(1, Math.round(h / blockSize));

  return sharp(buffer)
    .resize(smallW, smallH, { fit: "fill", kernel: "nearest" })
    .resize(w, h, { fit: "fill", kernel: "nearest" })
    .png()
    .toBuffer();
}
