import sharp from "sharp";
import { expect, it } from "vitest";
import { jitter } from "./jitter.ts";

it("wraps large seeds to signed 32-bit state before generating jitter", async () => {
  const pixels = Buffer.from(Array.from({ length: 16 * 16 * 4 }, (_, index) =>
    index % 4 === 3 ? 255 : (index * 17) % 256,
  ));
  const input = await sharp(pixels, { raw: { width: 16, height: 16, channels: 4 } })
    .png().toBuffer();
  const expected = await jitter(input, { amount: 3, seed: -1 });
  expect(await jitter(input, { amount: 3, seed: Number.MAX_SAFE_INTEGER })).toEqual(expected);
  expect(await jitter(input, { amount: 3, seed: 0xffffffff })).toEqual(expected);
});
