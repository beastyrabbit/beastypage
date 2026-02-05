import sharp from "sharp";
import type { BlendMode } from "../models.ts";

type BlendFn = (a: number, b: number) => number;

function blendNormal(_a: number, b: number): number {
  return b;
}

function blendMultiply(a: number, b: number): number {
  return (a * b) / 255;
}

function blendAdd(a: number, b: number): number {
  return Math.min(255, a + b);
}

function blendScreen(a: number, b: number): number {
  return 255 - ((255 - a) * (255 - b)) / 255;
}

function blendOverlay(a: number, b: number): number {
  return a < 128
    ? (2 * a * b) / 255
    : 255 - (2 * (255 - a) * (255 - b)) / 255;
}

function blendSoftLight(a: number, b: number): number {
  if (b < 128) {
    return a - ((255 - 2 * b) * a * (255 - a)) / (255 * 255);
  }
  const d = a < 64
    ? ((16 * a / 255 - 12) * a / 255 + 4) * a
    : Math.sqrt(a / 255) * 255;
  return a + ((2 * b - 255) * (d - a)) / 255;
}

const BLEND_FNS: Record<BlendMode, BlendFn> = {
  normal: blendNormal,
  multiply: blendMultiply,
  add: blendAdd,
  screen: blendScreen,
  overlay: blendOverlay,
  "soft-light": blendSoftLight,
};

/**
 * Blend two same-sized image buffers together using the specified blend mode and opacity.
 */
export async function blendImages(
  baseBuffer: Buffer,
  overlayBuffer: Buffer,
  mode: BlendMode,
  opacity: number,
): Promise<Buffer> {
  const baseImg = sharp(baseBuffer).ensureAlpha();
  const overlayImg = sharp(overlayBuffer).ensureAlpha();

  const { data: baseData, info } = await baseImg.raw().toBuffer({ resolveWithObject: true });
  const { data: overlayData } = await overlayImg.raw().toBuffer({ resolveWithObject: true });

  const base = new Uint8Array(baseData.buffer);
  const overlay = new Uint8Array(overlayData.buffer);
  const out = new Uint8Array(base.length);
  const fn = BLEND_FNS[mode];

  for (let i = 0; i < base.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const blended = fn(base[i + c]!, overlay[i + c]!);
      out[i + c] = Math.round(base[i + c]! * (1 - opacity) + blended * opacity);
    }
    // Preserve alpha from base
    out[i + 3] = base[i + 3]!;
  }

  return sharp(out, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}
