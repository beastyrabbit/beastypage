import sharp from "sharp";
import { config } from "../config.ts";

export class ProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProcessingError";
  }
}

/** Parse a data-URL into its MIME type and a raw Buffer. */
export function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } {
  const match = dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
  if (!match || !match[1] || !match[2]) {
    throw new ProcessingError("Invalid data URL format");
  }
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > config.maxImageSize) {
    throw new ProcessingError(
      `Image exceeds maximum size of ${Math.round(config.maxImageSize / 1024 / 1024)}MB`,
    );
  }
  return { mime: match[1], buffer };
}

/** Encode a Buffer to a base64 data-URL. */
export function bufferToDataUrl(buffer: Buffer, format: string): string {
  const mime = format === "jpeg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

/** Validate that an image's dimensions are within limits. */
export async function validateDimensions(
  buffer: Buffer,
): Promise<{ width: number; height: number }> {
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (width === 0 || height === 0) {
    throw new ProcessingError("Unable to read image dimensions");
  }
  if (width > config.maxDimension || height > config.maxDimension) {
    throw new ProcessingError(
      `Image dimensions (${width}x${height}) exceed maximum of ${config.maxDimension}px`,
    );
  }
  return { width, height };
}

/** Downscale an image so its longest side is ≤ maxDimension. Returns buffer + new dimensions. */
export async function downscaleForPreview(
  buffer: Buffer,
  maxDimension: number,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const meta = await sharp(buffer).metadata();
  const w = meta.width;
  const h = meta.height;
  if (!w || !h) {
    throw new ProcessingError("Unable to read image dimensions for preview downscale");
  }

  if (w <= maxDimension && h <= maxDimension) {
    return { buffer, width: w, height: h };
  }

  const scale = maxDimension / Math.max(w, h);
  const newW = Math.round(w * scale);
  const newH = Math.round(h * scale);

  const resized = await sharp(buffer)
    .resize(newW, newH, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();

  return { buffer: resized, width: newW, height: newH };
}
