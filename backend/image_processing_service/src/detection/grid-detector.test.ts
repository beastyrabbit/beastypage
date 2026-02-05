import { describe, it, expect } from "bun:test";
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
