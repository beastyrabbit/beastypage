import sharp from "sharp";

const BAYER_2 = [
  [0, 2],
  [3, 1],
];

const BAYER_4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const BAYER_8 = generateBayer8();

function generateBayer8(): number[][] {
  const size = 8;
  const matrix: number[][] = Array.from({ length: size }, () => Array(size).fill(0));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      let xc = x;
      let yc = y;
      for (let bit = size >> 1; bit > 0; bit >>= 1) {
        v = (v << 2) | (((xc & bit) !== 0 ? 2 : 0) ^ ((yc & bit) !== 0 ? 3 : 0));
        xc >>= 1;
        yc >>= 1;
      }
      matrix[y]![x] = v;
    }
  }
  // Normalize to 0..1 range will happen at usage time
  return matrix;
}

function getMatrix(size: number): number[][] {
  if (size <= 2) return BAYER_2;
  if (size <= 4) return BAYER_4;
  return BAYER_8;
}

/**
 * Ordered Bayer dithering. Applies a threshold matrix to quantize colors
 * into a limited number of levels while creating an ordered pattern.
 */
export async function ditherBayer(
  buffer: Buffer,
  params: Record<string, unknown>,
): Promise<Buffer> {
  const matrixSize = Math.max(2, Math.min(8, Math.round(Number(params.matrixSize) || 4)));
  const levels = Math.max(2, Math.min(32, Math.round(Number(params.levels) || 8)));

  const image = sharp(buffer).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const pixels = new Uint8Array(data.buffer);

  const matrix = getMatrix(matrixSize);
  const mSize = matrix.length;
  const mMax = mSize * mSize;
  const step = 255 / (levels - 1);

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * 4;
      const threshold = (matrix[y % mSize]![x % mSize]! / mMax - 0.5) * step;

      for (let c = 0; c < 3; c++) {
        const val = pixels[idx + c]! + threshold;
        pixels[idx + c] = Math.max(0, Math.min(255, Math.round(Math.round(val / step) * step)));
      }
    }
  }

  return sharp(pixels, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}
