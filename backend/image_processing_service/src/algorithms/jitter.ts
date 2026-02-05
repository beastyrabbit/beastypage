import sharp from "sharp";

/**
 * Simple seeded PRNG (mulberry32).
 */
function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sub-pixel jitter displacement. Shifts each pixel by a small random offset,
 * creating a hand-drawn or organic feel. Uses seeded PRNG for reproducibility.
 */
export async function jitter(
  buffer: Buffer,
  params: Record<string, unknown>,
): Promise<Buffer> {
  const amount = Math.max(0.5, Math.min(20, Number(params.amount) || 3));
  const seed = Math.round(Number(params.seed) || 42);

  const image = sharp(buffer).ensureAlpha();
  const { data: srcData, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const src = new Uint8Array(srcData.buffer);

  const w = info.width;
  const h = info.height;
  const out = new Uint8Array(w * h * 4);
  const rng = mulberry32(seed);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = Math.round((rng() - 0.5) * 2 * amount);
      const dy = Math.round((rng() - 0.5) * 2 * amount);

      const sx = Math.max(0, Math.min(w - 1, x + dx));
      const sy = Math.max(0, Math.min(h - 1, y + dy));

      const dstIdx = (y * w + x) * 4;
      const srcIdx = (sy * w + sx) * 4;

      out[dstIdx] = src[srcIdx]!;
      out[dstIdx + 1] = src[srcIdx + 1]!;
      out[dstIdx + 2] = src[srcIdx + 2]!;
      out[dstIdx + 3] = src[srcIdx + 3]!;
    }
  }

  return sharp(out, {
    raw: { width: w, height: h, channels: 4 },
  })
    .png()
    .toBuffer();
}
