import sharp from "sharp";
import { describe, expect, it } from "vitest";
import type { OutputFormat, PipelineStep } from "../models.ts";
import { executePipeline } from "./executor.ts";
import { nearestNeighbor } from "../algorithms/nearest-neighbor.ts";

function step(id: string, inputSource = "original"): PipelineStep {
  return { id, inputSource, enabled: true, label: id, algorithm: "nearest-neighbor", params: { blockSize: 2 } };
}

async function image(): Promise<Buffer> {
  const pixels = Buffer.from(Array.from({ length: 8 * 8 * 3 }, (_, i) => (i * 31) % 256));
  return sharp(pixels, { raw: { width: 8, height: 8, channels: 3 } }).png().toBuffer();
}

describe("pipeline execution", () => {
  it("retains a shared input through both blend consumption and a later branch", async () => {
    const input = await image();
    const result = await executePipeline(input, [
      step("first"),
      { ...step("blend", "first"), blendWith: { stepId: "first", mode: "normal", opacity: 0.5 } },
      step("last", "first"),
    ], "png", 90);
    const first = await nearestNeighbor(await sharp(input).ensureAlpha().png().toBuffer(), { blockSize: 2 });
    const expected = await nearestNeighbor(first, { blockSize: 2 });
    expect(result).toMatchObject({ width: 8, height: 8, stepsProcessed: 3 });
    expect(await sharp(result.result).raw().toBuffer()).toEqual(await sharp(expected).raw().toBuffer());
  });

  it("ignores disabled steps and permits their IDs on later enabled steps", async () => {
    const input = await image();
    const result = await executePipeline(input, [
      { ...step("first", "missing"), enabled: false },
      step("first", ""),
    ], "png", 90);
    expect(result.stepsProcessed).toBe(1);
  });

  it.each([0, 1])("uses the selected blend source and opacity %s", async (opacity) => {
    const input = await image();
    const result = await executePipeline(input, [
      { ...step("base"), params: { blockSize: 4 } },
      { ...step("blend"), blendWith: { stepId: "base", mode: "normal", opacity } },
    ], "png", 90);
    const expected = await nearestNeighbor(await sharp(input).ensureAlpha().png().toBuffer(), { blockSize: opacity === 0 ? 4 : 2 });
    expect(await sharp(result.result).raw().toBuffer()).toEqual(await sharp(expected).raw().toBuffer());
  });

  it.each<OutputFormat>(["png", "jpeg", "webp"])("encodes the original as %s when every step is disabled", async (format) => {
    const result = await executePipeline(await image(), [{ ...step("ignored"), enabled: false }], format, 83);
    expect(result).toMatchObject({ stepsProcessed: 0, width: 8, height: 8 });
    expect((await sharp(result.result).metadata()).format).toBe(format);
  });

  it.each([
    { name: "empty ID", steps: [step("")], error: "unique" },
    { name: "reserved ID", steps: [step("original")], error: "unique" },
    { name: "duplicate ID", steps: [step("first"), step("first")], error: "unique" },
    { name: "forward reference", steps: [step("first", "later"), step("later")], error: "earlier enabled step" },
    { name: "self reference", steps: [step("first", "first")], error: "earlier enabled step" },
    { name: "disabled input", steps: [{ ...step("first"), enabled: false }, step("last", "first")], error: "earlier enabled step" },
    { name: "unknown blend", steps: [{ ...step("first"), blendWith: { stepId: "missing", mode: "normal" as const, opacity: 1 } }], error: "earlier enabled step" },
  ])("rejects $name", async ({ steps, error }) => {
    await expect(executePipeline(await image(), steps, "png", 90)).rejects.toThrow(error);
  });
});
