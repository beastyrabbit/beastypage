import { describe, expect, it } from "vitest";
import { createPreviewBatcher, type PreviewBatchItem } from "./previewBatcher";

function createTestBatcher(options: {
  batchSize?: number;
  concurrency?: number;
  renderBatch: (
    items: readonly PreviewBatchItem<string>[],
  ) => Promise<ReadonlyMap<string, string>>;
  renderSingle?: (item: PreviewBatchItem<string>) => Promise<string | null>;
}) {
  const cache = new Map<string, string>();
  const batcher = createPreviewBatcher({
    ...options,
    getCached: (key) => cache.get(key),
    setCached: (key, value) => cache.set(key, value),
    renderSingle:
      options.renderSingle ?? (async (item) => `single:${item.value}`),
  });
  return { batcher, cache };
}

describe("createPreviewBatcher", () => {
  it("chunks requests and caps concurrent batch renders", async () => {
    let active = 0;
    let maxActive = 0;
    const batches: string[][] = [];
    const { batcher } = createTestBatcher({
      batchSize: 2,
      concurrency: 2,
      renderBatch: async (items) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        batches.push(items.map((item) => item.key));
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return new Map(items.map((item) => [item.key, `batch:${item.value}`]));
      },
    });

    const previews = await Promise.all(
      ["a", "b", "c", "d", "e"].map((key) =>
        batcher.request(key, key.toUpperCase()),
      ),
    );

    expect(previews).toEqual([
      "batch:A",
      "batch:B",
      "batch:C",
      "batch:D",
      "batch:E",
    ]);
    expect(batches).toEqual([["a", "b"], ["c", "d"], ["e"]]);
    expect(maxActive).toBe(2);
  });

  it("serves cache hits without requesting them again", async () => {
    let batchCalls = 0;
    const { batcher, cache } = createTestBatcher({
      renderBatch: async (items) => {
        batchCalls += 1;
        return new Map(items.map((item) => [item.key, `batch:${item.value}`]));
      },
    });

    await expect(batcher.request("cached", "first")).resolves.toBe(
      "batch:first",
    );
    cache.set("already-there", "cached-value");
    await expect(batcher.request("already-there", "second")).resolves.toBe(
      "cached-value",
    );

    expect(batchCalls).toBe(1);
  });

  it("falls back to individual renders when a chunk fails", async () => {
    const singleCalls: string[] = [];
    const { batcher } = createTestBatcher({
      batchSize: 2,
      renderBatch: async (items) => {
        if (items.some((item) => item.key === "bad")) {
          throw new Error("batch unavailable");
        }
        return new Map(items.map((item) => [item.key, `batch:${item.value}`]));
      },
      renderSingle: async (item) => {
        singleCalls.push(item.key);
        return `single:${item.value}`;
      },
    });

    await expect(
      Promise.all([
        batcher.request("good", "one"),
        batcher.request("bad", "two"),
      ]),
    ).resolves.toEqual(["single:one", "single:two"]);
    expect(singleCalls).toEqual(["good", "bad"]);
  });
});
