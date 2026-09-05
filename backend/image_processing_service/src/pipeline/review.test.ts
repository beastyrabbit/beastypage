import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { generateBayer8, ditherBayer } from "../algorithms/dither-bayer.ts";
import { executePipeline } from "./executor.ts";
import { validateWork } from "../processing.ts";
import { validateDimensions } from "../utils/image.ts";
import { runJob } from "../workers.ts";
import { routes } from "../routes/index.ts";
import type { PipelineStep } from "../models.ts";

const step = (id: string, inputSource = "original"): PipelineStep => ({ id, inputSource, algorithm: "nearest-neighbor", params: { blockSize: 2 }, enabled: true, label: id });
const image = () => sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 128, g: 128, b: 128, alpha: 1 } } }).png().toBuffer();

describe("image processing review regressions", () => {
  it("has all 64 Bayer thresholds and preserves the ordered 4x4 pattern", async () => {
    const matrix = generateBayer8();
    expect(matrix.flat().sort((a, b) => a - b)).toEqual(Array.from({ length: 64 }, (_, i) => i));
    expect(matrix[0]).toEqual([0, 32, 8, 40, 2, 34, 10, 42]);
    const pixels = await sharp(await ditherBayer(await image(), { matrixSize: 8, levels: 2 })).raw().toBuffer();
    expect([...pixels.subarray(0, 32)].filter((_, i) => i % 4 === 0)).toEqual([0, 255, 0, 255, 0, 255, 0, 255]);
  });

  it("keeps branch/blend inputs until their final consumer", async () => {
    const input = await image();
    const steps = [step("first"), step("branch"), { ...step("blend", "first"), blendWith: { stepId: "branch", mode: "normal" as const, opacity: 0.5 } }];
    const result = await executePipeline(input, steps, "png", 90);
    expect(result.stepsProcessed).toBe(3);
    expect(await sharp(result.result).raw().toBuffer()).toEqual(await sharp(input).raw().toBuffer());
    await expect(executePipeline(input, [step("later", "missing")], "png", 90)).rejects.toThrow("earlier");
    await expect(executePipeline(input, [step("duplicate"), step("duplicate")], "png", 90)).rejects.toThrow("unique");
  });

  it("rejects excessive decoded pixels and algorithm work without large allocations", async () => {
    expect(() => validateWork(4_000_000, Array.from({ length: 9 }, (_, i) => step(String(i))))).toThrow("budget");
    expect(() => validateWork(4_000_000, [step("small")])).not.toThrow();
    const input = await image();
    expect(await validateDimensions(input)).toEqual({ width: 8, height: 8 });
  });

  it("runs real small exports off the HTTP thread and keeps health responsive", async () => {
    const input = await image();
    const pending = runJob("process", { image: `data:image/png;base64,${input.toString("base64")}`, mode: "full", pipeline: { steps: [step("first")] }, outputFormat: "png", outputQuality: 90 }, new AbortController().signal);
    expect((await routes.request("/health")).status).toBe(200);
    expect(await pending).toMatchObject({ meta: { width: 8, height: 8, steps_processed: 1 } });
  });

  it("cancels a worker and releases admission capacity", async () => {
    const input = await image();
    const request = { image: `data:image/png;base64,${input.toString("base64")}` };
    const controller = new AbortController();
    const pending = runJob("detect", request, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow("cancelled");
    await expect(runJob("detect", request, new AbortController().signal)).resolves.toHaveProperty("detected");
  });
});
