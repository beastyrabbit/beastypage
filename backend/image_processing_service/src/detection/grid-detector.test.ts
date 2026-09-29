import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { detectGrid } from "./grid-detector.ts";
import { blockAverage } from "../algorithms/block-average.ts";
import { nearestNeighbor } from "../algorithms/nearest-neighbor.ts";

/**
 * Generate a random colorful image with the given dimensions.
 * Each pixel gets a random RGB value.
 */
async function makeRandomImage(width: number, height: number): Promise<Buffer> {
  const channels = 3;
  const pixels = Buffer.alloc(width * height * channels);
  for (let i = 0; i < pixels.length; i++) {
    pixels[i] = Math.floor(Math.random() * 256);
  }
  return sharp(pixels, { raw: { width, height, channels } }).png().toBuffer();
}

/**
 * Compute the actual block size in the pixelated image.
 * When image width isn't divisible by blockSize, sharp rounds the
 * small dimension, then nearest-neighbor upscale creates blocks of
 * approximately `width / Math.round(width / blockSize)` pixels.
 */
function actualGridSize(imageWidth: number, blockSize: number): number {
  const smallW = Math.max(1, Math.round(imageWidth / blockSize));
  return Math.round(imageWidth / smallW);
}

describe("grid-detector", () => {
  it.each([
    { width: 32, height: 32, xSize: 4, ySize: 4, gridSize: 4, confidence: 1 },
    { width: 32, height: 32, xSize: 4, ySize: 32, gridSize: 4, confidence: 0.8 },
    { width: 32, height: 32, xSize: 32, ySize: 4, gridSize: 4, confidence: 0.8 },
    { width: 32, height: 32, xSize: 4, ySize: 8, gridSize: 4, confidence: 0.7 },
    { width: 32, height: 5, xSize: 4, ySize: 5, gridSize: 4, confidence: 0.8 },
    { width: 32, height: 4001, xSize: 4, ySize: 4001, gridSize: 4, confidence: 0.8 },
  ])("combines deterministic axis periods $xSize/$ySize in $width x $height", async ({ width, height, xSize, ySize, gridSize, confidence }) => {
    const pixels = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 3;
        pixels[offset] = (Math.floor(x / xSize) % 2) * 255;
        pixels[offset + 1] = (Math.floor(y / ySize) % 2) * 255;
      }
    }
    const input = await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
    expect(await detectGrid(input)).toEqual({ detected: true, gridSize, confidence });
  });

  it.each([4, 32])("does not invent edges in a uniform %s-pixel image", async (size) => {
    const input = await sharp({ create: { width: size, height: size, channels: 3, background: "red" } }).png().toBuffer();
    expect(await detectGrid(input)).toEqual({ detected: false, gridSize: null, confidence: 0 });
  });

  it.each([
    { boundaries: [0, 4, 8, 13, 17, 22, 26], expected: { detected: true, gridSize: 4, confidence: 0.8 } },
    { boundaries: [0, 4, 6, 12, 22, 36, 54], expected: { detected: false, gridSize: null, confidence: 0 } },
  ])("requires consistent gaps while tolerating rounding: $boundaries", async ({ boundaries, expected }) => {
    const width = 60;
    const pixels = Buffer.alloc(width * 8);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < width; x++) {
        pixels[y * width + x] = (boundaries.filter(boundary => boundary <= x).length % 2) * 255;
      }
    }
    const input = await sharp(pixels, { raw: { width, height: 8, channels: 1 } }).png().toBuffer();
    expect(await detectGrid(input)).toEqual(expected);
  });

  // Test a range of block sizes with block-average pixelation
  const blockSizes = [4, 6, 8, 10, 12, 16, 20, 24, 32];

  for (const blockSize of blockSizes) {
    it(`detects grid size ${blockSize} from block-average pixelated 256x256 image`, async () => {
      const original = await makeRandomImage(256, 256);
      const pixelated = await blockAverage(original, { blockSize });
      const result = await detectGrid(pixelated);

      const expected = actualGridSize(256, blockSize);
      console.log(
        `  blockSize=${blockSize}, actual=${expected}: detected=${result.detected}, gridSize=${result.gridSize}, confidence=${result.confidence}`,
      );

      expect(result.detected).toBe(true);
      expect(Math.abs(result.gridSize! - expected)).toBeLessThanOrEqual(1);
    });

    it(`detects grid size ${blockSize} from nearest-neighbor pixelated 256x256 image`, async () => {
      const original = await makeRandomImage(256, 256);
      const pixelated = await nearestNeighbor(original, { blockSize });
      const result = await detectGrid(pixelated);

      const expected = actualGridSize(256, blockSize);
      console.log(
        `  blockSize=${blockSize}, actual=${expected}: detected=${result.detected}, gridSize=${result.gridSize}, confidence=${result.confidence}`,
      );

      expect(result.detected).toBe(true);
      expect(Math.abs(result.gridSize! - expected)).toBeLessThanOrEqual(1);
    });
  }

  // Test with larger images (common real-world sizes)
  const largerSizes = [
    { w: 512, h: 512, blockSize: 8 },
    { w: 512, h: 512, blockSize: 16 },
    { w: 800, h: 600, blockSize: 10 },
    { w: 800, h: 600, blockSize: 16 },
    { w: 1024, h: 1024, blockSize: 16 },
    { w: 1024, h: 1024, blockSize: 32 },
  ];

  for (const { w, h, blockSize } of largerSizes) {
    it(`detects grid size ${blockSize} in ${w}x${h} image`, async () => {
      const original = await makeRandomImage(w, h);
      const pixelated = await blockAverage(original, { blockSize });
      const result = await detectGrid(pixelated);

      const expected = actualGridSize(w, blockSize);
      console.log(
        `  ${w}x${h} blockSize=${blockSize}, actual=${expected}: detected=${result.detected}, gridSize=${result.gridSize}, confidence=${result.confidence}`,
      );

      expect(result.detected).toBe(true);
      expect(Math.abs(result.gridSize! - expected)).toBeLessThanOrEqual(1);
    });
  }

  // Test that a non-pixelated random image is NOT detected as pixel art
  it("does not detect grid in random noise image", async () => {
    const noise = await makeRandomImage(256, 256);
    const result = await detectGrid(noise);

    console.log(
      `  random noise: detected=${result.detected}, gridSize=${result.gridSize}, confidence=${result.confidence}`,
    );

    expect(result.detected).toBe(false);
  });

  // Random block size test — run 5 random cases
  for (let i = 0; i < 5; i++) {
    it(`detects a random block size (run ${i + 1})`, async () => {
      const blockSize = 3 + Math.floor(Math.random() * 38); // 3-40
      const imgSize = 200 + Math.floor(Math.random() * 300); // 200-500

      const original = await makeRandomImage(imgSize, imgSize);
      const pixelated = await blockAverage(original, { blockSize });
      const result = await detectGrid(pixelated);

      const expected = actualGridSize(imgSize, blockSize);
      console.log(
        `  ${imgSize}x${imgSize} blockSize=${blockSize}, actual=${expected}: detected=${result.detected}, gridSize=${result.gridSize}, confidence=${result.confidence}`,
      );

      expect(result.detected).toBe(true);
      expect(Math.abs(result.gridSize! - expected)).toBeLessThanOrEqual(1);
    });
  }
});
