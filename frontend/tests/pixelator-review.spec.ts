import { afterEach, expect, it, vi } from "vitest";
import { processImage } from "@/lib/pixelator/api";
import { repairPipeline } from "@/lib/pixelator/pipeline";
import type { PipelineStep } from "@/lib/pixelator/types";
import { imageToDataUrl } from "@/lib/color-extraction/image-processing";

const step = (id: string, inputSource = "original"): PipelineStep => ({
  id,
  inputSource,
  algorithm: "nearest-neighbor",
  params: {},
  enabled: true,
  label: id,
});
afterEach(() => vi.unstubAllGlobals());

it("preserves wide images within four megapixels and scales larger images by area", () => {
  const drawImage = vi.fn();
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage }),
    toDataURL: () => "fixture",
  };
  vi.stubGlobal("document", { createElement: () => canvas });
  imageToDataUrl(
    { width: 4000, height: 800 } as HTMLImageElement,
    4000,
    4_000_000,
  );
  expect([canvas.width, canvas.height]).toEqual([4000, 800]);
  imageToDataUrl(
    { width: 4000, height: 2000 } as HTMLImageElement,
    4000,
    4_000_000,
  );
  expect(canvas.width * canvas.height).toBeLessThanOrEqual(4_000_000);
  expect(canvas.width).toBeGreaterThan(2000);
});

it("repairs both reference kinds after disable, delete, and reorder", () => {
  const first = step("first");
  const next = {
    ...step("next", "first"),
    blendWith: { stepId: "first", mode: "normal" as const, opacity: 1 },
  };
  expect(repairPipeline([first, next])[1]).toEqual(next);
  for (const steps of [
    [{ ...first, enabled: false }, next],
    [next],
    [next, first],
  ]) {
    expect(repairPipeline(steps).find((s) => s.id === "next")).toMatchObject({
      inputSource: "original",
      blendWith: null,
    });
  }
});

it("passes cancellation through to fetch and rejects a cancelled response", async () => {
  const controller = new AbortController();
  const fetchMock = vi.fn(
    (_url: unknown, init: RequestInit) =>
      new Promise<Response>((_, reject) =>
        init.signal!.addEventListener("abort", () =>
          reject(new DOMException("Cancelled", "AbortError")),
        ),
      ),
  );
  vi.stubGlobal("fetch", fetchMock);
  const pending = processImage(
    "fixture",
    { steps: [step("a")] },
    "preview",
    "png",
    90,
    controller.signal,
  );
  expect(fetchMock.mock.calls[0]?.[1].signal).toBe(controller.signal);
  controller.abort();
  await expect(pending).rejects.toThrow("Cancelled");
});
