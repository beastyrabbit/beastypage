import { createCanvas } from "@napi-rs/canvas";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { assertImageSourceWithinLimits } from "../../image-source-limits";
import {
  extractColorsServer,
  generatePaletteImage,
  getImagePixelsServer,
} from "../server-extraction";

/** Create a small solid-color PNG as a Buffer. */
function makeSolidPng(r: number, g: number, b: number, size = 20): Buffer {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, size, size);
  return canvas.toBuffer("image/png");
}

/** Create a two-tone PNG (left half / right half). */
function makeTwoTonePng(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number,
  size = 40,
): Buffer {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = `rgb(${r1},${g1},${b1})`;
  ctx.fillRect(0, 0, size / 2, size);
  ctx.fillStyle = `rgb(${r2},${g2},${b2})`;
  ctx.fillRect(size / 2, 0, size / 2, size);
  return canvas.toBuffer("image/png");
}

/** Create only a PNG header, useful for testing pre-decode validation. */
function makePngHeader(width: number, height: number): Buffer {
  const header = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(header);
  header.writeUInt32BE(13, 8);
  header.write("IHDR", 12, "ascii");
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return header;
}

/** Create a JPEG header with metadata before its start-of-frame marker. */
function makeJpegHeader(
  width: number,
  height: number,
  metadataBytes = 0,
): Buffer {
  const chunks = [Buffer.from([0xff, 0xd8])];
  let remaining = metadataBytes;
  while (remaining > 0) {
    const payloadLength = Math.min(remaining, 65_533);
    const app = Buffer.alloc(payloadLength + 4);
    app[0] = 0xff;
    app[1] = 0xe1;
    app.writeUInt16BE(payloadLength + 2, 2);
    chunks.push(app);
    remaining -= payloadLength;
  }

  const frame = Buffer.alloc(21);
  frame[0] = 0xff;
  frame[1] = 0xc0;
  frame.writeUInt16BE(17, 2);
  frame[4] = 8;
  frame.writeUInt16BE(height, 5);
  frame.writeUInt16BE(width, 7);
  frame[9] = 3;
  chunks.push(frame);
  return Buffer.concat(chunks);
}

describe("getImagePixelsServer", () => {
  it("returns data, width, and height for a valid PNG", async () => {
    const buf = makeSolidPng(128, 64, 32);
    const result = await getImagePixelsServer(buf);
    expect(result).toHaveProperty("data");
    expect(result).toHaveProperty("width");
    expect(result).toHaveProperty("height");
    expect(result.width).toBe(20);
    expect(result.height).toBe(20);
    expect(result.data).toBeInstanceOf(Uint8ClampedArray);
    expect(result.data).toHaveLength(20 * 20 * 4);
  });

  it("rejects oversized PNG dimensions before decoding the image", async () => {
    // This is intentionally only a header: loadImage must never be reached.
    const oversized = makePngHeader(5_001, 5_000);
    await expect(getImagePixelsServer(oversized)).rejects.toThrow(
      "Image dimensions exceed processing limits",
    );
  });

  it("rejects oversized JPEG dimensions after large metadata", async () => {
    const oversized = makeJpegHeader(5_001, 5_000, 70_000);
    await expect(getImagePixelsServer(oversized)).rejects.toThrow(
      "Image dimensions exceed processing limits",
    );
  });

  it("accepts a normal JPEG", async () => {
    const canvas = createCanvas(20, 20);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "rgb(128, 64, 32)";
    ctx.fillRect(0, 0, 20, 20);
    const result = await getImagePixelsServer(canvas.toBuffer("image/jpeg"));
    expect(result.width).toBe(20);
    expect(result.height).toBe(20);
  });

  it("accepts BMP sources after validating their header dimensions", async () => {
    const bmp = Buffer.alloc(54 + 4, 0);
    bmp.write("BM", 0, "ascii");
    bmp.writeUInt32LE(bmp.length, 2);
    bmp.writeUInt32LE(54, 10);
    bmp.writeUInt32LE(40, 14);
    bmp.writeInt32LE(1, 18);
    bmp.writeInt32LE(1, 22);
    bmp.writeUInt16LE(1, 26);
    bmp.writeUInt16LE(24, 28);
    // A one-pixel BGR payload is enough for the decoder to read the image.
    bmp.writeUInt8(32, 54);
    bmp.writeUInt8(64, 55);
    bmp.writeUInt8(128, 56);
    await expect(getImagePixelsServer(bmp)).resolves.toMatchObject({
      width: 1,
      height: 1,
    });
  });

  it("normalizes TIFF and AVIF sources for the canvas decoder", async () => {
    const source = sharp({
      create: {
        width: 20,
        height: 20,
        channels: 3,
        background: { r: 128, g: 64, b: 32 },
      },
    });
    const [tiff, avif] = await Promise.all([
      source.clone().tiff().toBuffer(),
      source.clone().avif().toBuffer(),
    ]);
    await expect(getImagePixelsServer(tiff)).resolves.toMatchObject({
      width: 20,
      height: 20,
    });
    await expect(getImagePixelsServer(avif)).resolves.toMatchObject({
      width: 20,
      height: 20,
    });
  });

  it("rejects unknown image headers before decoding", () => {
    expect(() =>
      assertImageSourceWithinLimits(Buffer.from("not an image")),
    ).toThrow("Unsupported or unreadable raster image header");
  });

  it("keeps resizing normal high-resolution images", async () => {
    const buf = makeSolidPng(128, 64, 32, 1_300);
    const result = await getImagePixelsServer(buf);
    expect(result.width).toBe(1_200);
    expect(result.height).toBe(1_200);
  });
});

describe("extractColorsServer", () => {
  it("returns the requested number of colors from a multi-color image", async () => {
    // Use colors that are NOT near-black or near-white (they get filtered)
    const buf = makeTwoTonePng(200, 50, 50, 50, 50, 200);
    const colors = await extractColorsServer(buf, { k: 2 });
    expect(colors).toHaveLength(2);
    for (const c of colors) {
      expect(c).toHaveProperty("hex");
      expect(c).toHaveProperty("rgb");
      expect(c).toHaveProperty("prevalence");
      expect(c.hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("prevalence sums close to 100", async () => {
    const buf = makeTwoTonePng(200, 50, 50, 50, 50, 200);
    const colors = await extractColorsServer(buf, { k: 2 });
    const total = colors.reduce((s, c) => s + c.prevalence, 0);
    expect(total).toBeGreaterThanOrEqual(90);
    expect(total).toBeLessThanOrEqual(110);
  });

  it("throws for a single-color image", async () => {
    const buf = makeSolidPng(128, 64, 32);
    // Only one unique color → not enough for k-means clustering
    await expect(
      extractColorsServer(buf, {
        k: 6,
        filterBlackWhite: false,
        sampleStep: 1,
      }),
    ).rejects.toThrow("Not enough unique colors");
  });
});

describe("generatePaletteImage", () => {
  it("returns a valid base64 PNG data URL", () => {
    const colors = [
      { hex: "#ff0000", rgb: { r: 255, g: 0, b: 0 } },
      { hex: "#00ff00", rgb: { r: 0, g: 255, b: 0 } },
      { hex: "#0000ff", rgb: { r: 0, g: 0, b: 255 } },
    ];
    const result = generatePaletteImage(colors);
    expect(result).toMatch(/^data:image\/png;base64,/);
    const base64Part = result.replace("data:image/png;base64,", "");
    expect(base64Part.length).toBeGreaterThan(0);
  });
});
