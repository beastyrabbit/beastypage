import { afterEach, describe, expect, it, vi } from "vitest";
import type { CatGeneratorApi } from "@/components/cat-builder/types";
import type { BatchRenderResponse, CatParams } from "@/lib/cat-v3/types";
import { createSpinFrameLoader, SpinLoaderDisposedError } from "../frameLoader";
import type { VariantDescriptor } from "../types";

interface FakeCanvas {
  width: number;
  height: number;
  tag?: string;
  draws: unknown[][];
  getContext: () => unknown;
}

interface FakeSheet {
  sheet: number;
}

type Variant = { id: string; params: Partial<CatParams> };

function fakeCanvas(width: number, height: number, tag?: string) {
  const draws: unknown[][] = [];
  const canvas: FakeCanvas = {
    width,
    height,
    tag,
    draws,
    getContext: () => ({
      imageSmoothingEnabled: true,
      drawImage: (...args: unknown[]) => {
        draws.push(args);
      },
    }),
  };
  return canvas as unknown as HTMLCanvasElement;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function createHarness(
  options: { manual?: boolean; batch?: "ok" | "throw" | "short" | "none" } = {},
) {
  const { manual = false, batch = "ok" } = options;
  const batchCalls: { variants: Variant[]; options: unknown }[] = [];
  const catCalls: Partial<CatParams>[] = [];
  const gates: (() => void)[] = [];
  let active = 0;
  let maxActive = 0;

  async function gate() {
    active += 1;
    maxActive = Math.max(maxActive, active);
    if (manual) {
      await new Promise<void>((resolve) => gates.push(resolve));
    } else {
      await Promise.resolve();
    }
    active -= 1;
  }

  const generator: CatGeneratorApi = {
    async generateCat(params) {
      catCalls.push(params);
      await gate();
      return { canvas: fakeCanvas(50, 50, `cat:${params.peltName}`) };
    },
  };

  if (batch !== "none") {
    generator.generateVariantSheet = async (_base, variants, batchOptions) => {
      const sheet = batchCalls.length;
      batchCalls.push({ variants, options: batchOptions });
      await gate();
      if (batch === "throw") {
        throw new Error("renderer rejected batch");
      }
      const returned = batch === "short" ? variants.slice(1) : variants;
      const response: BatchRenderResponse = {
        sheetDataUrl: `sheet:${sheet}`,
        width: variants.length * 50,
        height: 50,
        tileSize: 50,
        frames: returned.map((variant, index) => ({
          id: variant.id,
          index,
          column: index,
          row: 0,
          x: variants.indexOf(variant) * 50,
          y: 0,
          width: 50,
          height: 50,
        })),
      };
      return response;
    };
  }

  const decode = async (dataUrl: string) =>
    ({ sheet: Number(dataUrl.split(":")[1]) }) as unknown as CanvasImageSource;

  /** Which cat a loaded frame shows: the variant's peltName. */
  function shownPelt(canvas: HTMLCanvasElement) {
    const [source, sx] = (canvas as unknown as FakeCanvas).draws[0];
    if (typeof source === "object" && source && "sheet" in source) {
      const call = batchCalls[(source as FakeSheet).sheet];
      return call.variants[(sx as number) / 50].params.peltName;
    }
    return (source as FakeCanvas).tag?.replace("cat:", "");
  }

  async function releaseNext() {
    gates.shift()?.();
    await flush();
  }

  async function drain() {
    await flush();
    while (gates.length > 0) {
      await releaseNext();
    }
  }

  return {
    generator,
    batchCalls,
    catCalls,
    gates,
    decode,
    createCanvas: (width: number, height: number) => fakeCanvas(width, height),
    shownPelt,
    releaseNext,
    drain,
    get maxActive() {
      return maxActive;
    },
  };
}

function descriptors(count: number, prefix = "p"): VariantDescriptor[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    option: { raw: index, display: `${prefix}${index}` },
    params: { peltName: `${prefix}${index}` },
  }));
}

const base: Partial<CatParams> = { peltName: "base", spriteNumber: 1 };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createSpinFrameLoader", () => {
  it("splits large requests into native-size batch chunks in order", async () => {
    const h = createHarness();
    const loader = createSpinFrameLoader(h.generator, h);
    const list = descriptors(300);

    const frames = await loader.frames(base, list);

    expect(h.batchCalls.map((call) => call.variants.length)).toEqual([
      128, 128, 44,
    ]);
    for (const call of h.batchCalls) {
      expect(call.options).toEqual({
        includeSources: false,
        includeBase: false,
      });
    }
    expect(h.catCalls).toHaveLength(0);
    expect(frames.map((frame) => frame.option)).toEqual(
      list.map((d) => d.option),
    );
    expect(frames.map((frame) => h.shownPelt(frame.canvas))).toEqual(
      list.map((d) => d.params.peltName),
    );
    expect(frames[0].canvas.width).toBe(50);
    expect(frames[0].canvas.height).toBe(50);
  });

  it("reuses prefetched and in-flight frames", async () => {
    const h = createHarness({ manual: true });
    const loader = createSpinFrameLoader(h.generator, h);
    const list = descriptors(20);

    loader.prefetch(base, list);
    const pending = loader.frames(base, list);
    const subset = loader.frames(base, list.slice(5, 8));
    await h.drain();
    const [all, some] = await Promise.all([pending, subset]);
    const again = await loader.frames(base, list);

    expect(h.batchCalls).toHaveLength(1);
    expect(some.map((frame) => frame.canvas)).toEqual(
      all.slice(5, 8).map((frame) => frame.canvas),
    );
    expect(again.map((frame) => frame.canvas)).toEqual(
      all.map((frame) => frame.canvas),
    );
  });

  it("treats the same params with reordered keys as one frame", async () => {
    const h = createHarness();
    const loader = createSpinFrameLoader(h.generator, h);

    await loader.frames({ a: 1, b: 2 } as Partial<CatParams>, descriptors(3));
    await loader.frames({ b: 2, a: 1 } as Partial<CatParams>, descriptors(3));

    expect(h.batchCalls).toHaveLength(1);
  });

  it("never runs more requests than the concurrency limit", async () => {
    const h = createHarness({ manual: true });
    const loader = createSpinFrameLoader(h.generator, {
      ...h,
      chunkSize: 10,
      concurrency: 4,
    });

    loader.prefetchSingle({ peltName: "single-a" });
    const pending = loader.frames(base, descriptors(100));
    loader.prefetchSingle({ peltName: "single-b" });
    await flush();
    expect(h.gates).toHaveLength(4);

    await h.drain();
    const frames = await pending;

    expect(h.maxActive).toBe(4);
    expect(h.batchCalls).toHaveLength(10);
    expect(h.catCalls).toHaveLength(2);
    expect(frames).toHaveLength(100);
  });

  it("moves queued work that frames() needs to the front", async () => {
    const h = createHarness({ manual: true });
    const loader = createSpinFrameLoader(h.generator, {
      ...h,
      concurrency: 1,
    });

    loader.prefetch(base, descriptors(2, "a"));
    loader.prefetch(base, descriptors(2, "b"));
    loader.prefetch(base, descriptors(2, "c"));
    await flush();
    const pending = loader.frames(base, descriptors(2, "c"));
    await h.releaseNext();

    expect(
      h.batchCalls.map((call) => call.variants[0].params.peltName),
    ).toEqual(["a0", "c0"]);
    await h.drain();
    await pending;
    expect(h.batchCalls).toHaveLength(3);
  });

  it.each(["throw", "short"] as const)(
    "falls back to single renders when the batch is %s",
    async (batch) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const h = createHarness({ batch });
      const loader = createSpinFrameLoader(h.generator, {
        ...h,
        chunkSize: 4,
      });
      const list = descriptors(6);

      const frames = await loader.frames(base, list);

      expect(h.batchCalls).toHaveLength(2);
      expect(h.catCalls.map((params) => params.peltName).sort()).toEqual(
        list.map((d) => d.params.peltName).sort(),
      );
      expect(frames.map((frame) => h.shownPelt(frame.canvas))).toEqual(
        list.map((d) => d.params.peltName),
      );
      expect(warn).toHaveBeenCalledTimes(2);
    },
  );

  it("renders singly when the generator has no batch support", async () => {
    const h = createHarness({ batch: "none" });
    const loader = createSpinFrameLoader(h.generator, h);
    const list = descriptors(3);

    const frames = await loader.frames(base, list);

    expect(h.catCalls).toHaveLength(3);
    expect(frames.map((frame) => h.shownPelt(frame.canvas))).toEqual([
      "p0",
      "p1",
      "p2",
    ]);
  });

  it("memoizes single renders", async () => {
    const h = createHarness();
    const loader = createSpinFrameLoader(h.generator, h);

    loader.prefetchSingle({ peltName: "x", spriteNumber: 2 });
    const first = await loader.single({ spriteNumber: 2, peltName: "x" });
    const second = await loader.single({ peltName: "x", spriteNumber: 2 });

    expect(h.catCalls).toHaveLength(1);
    expect(second).toBe(first);
    expect(h.shownPelt(first)).toBe("x");
  });

  it("retries a frame after its render failed", async () => {
    const h = createHarness({ batch: "none" });
    let fail = true;
    const generateCat = h.generator.generateCat.bind(h.generator);
    h.generator.generateCat = async (params) => {
      if (fail) {
        fail = false;
        throw new Error("boom");
      }
      return generateCat(params);
    };
    const loader = createSpinFrameLoader(h.generator, h);

    await expect(loader.single({ peltName: "x" })).rejects.toThrow("boom");
    await expect(loader.single({ peltName: "x" })).resolves.toBeDefined();
  });

  it("rejects pending work and drops in-flight results on dispose", async () => {
    const h = createHarness({ manual: true });
    const loader = createSpinFrameLoader(h.generator, {
      ...h,
      chunkSize: 2,
      concurrency: 1,
    });

    const pending = loader.frames(base, descriptors(6));
    const single = loader.single({ peltName: "s" });
    await flush();
    expect(h.batchCalls).toHaveLength(1);

    loader.dispose();
    await expect(pending).rejects.toBeInstanceOf(SpinLoaderDisposedError);
    await expect(single).rejects.toBeInstanceOf(SpinLoaderDisposedError);

    await h.drain();
    expect(h.batchCalls).toHaveLength(1);
    expect(h.catCalls).toHaveLength(0);
    await expect(loader.frames(base, descriptors(1))).rejects.toBeInstanceOf(
      SpinLoaderDisposedError,
    );
  });
});
