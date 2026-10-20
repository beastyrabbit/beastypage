import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TileIndex } from "../tileset";

const index: TileIndex = {
  cell: 16,
  version: "test",
  sheets: {
    barn: { file: "barn.png", glow: "barn.glow.png", columns: 1, tiles: {} },
    birds: { file: "birds.png", columns: 1, tiles: {} },
  },
};

function mockImages(fails: (src: string, attempt: number) => boolean) {
  const requests = new Map<string, number>();
  class MockImage {
    onload = () => {};
    onerror = () => {};
    set src(src: string) {
      const attempt = (requests.get(src) ?? 0) + 1;
      requests.set(src, attempt);
      queueMicrotask(() => {
        if (fails(src, attempt)) this.onerror();
        else this.onload();
      });
    }
  }
  vi.stubGlobal("Image", MockImage);
  return requests;
}

describe("loadTileSet", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => index })),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps every main sheet when an optional glow permanently fails", async () => {
    const requests = mockImages((src) => src.includes("barn.glow"));
    const { loadTileSet, currentTileSet } = await import("../tile-sheets");
    const pending = loadTileSet();
    expect(loadTileSet()).toBe(pending);
    await vi.runAllTimersAsync();
    const set = await pending;
    expect(set?.images.size).toBe(2);
    expect(set?.glows.size).toBe(0);
    expect(currentTileSet()).toBe(set);
    expect(requests.get("/scene-planner/tiles/barn.glow.png?v=test")).toBe(3);
    expect(await loadTileSet()).toBe(set);
    expect(requests.get("/scene-planner/tiles/barn.png?v=test")).toBe(1);
  });

  it("automatically retries a transient glow failure without another call", async () => {
    mockImages((src, attempt) => src.includes("glow") && attempt === 1);
    const { loadTileSet } = await import("../tile-sheets");
    const pending = loadTileSet();
    await vi.advanceTimersByTimeAsync(249);
    let finished = false;
    void pending.then(() => {
      finished = true;
    });
    await Promise.resolve();
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending)?.glows.has("barn")).toBe(true);
  });

  it("drops only the failed main sheet after three spaced attempts", async () => {
    const requests = mockImages((src) => src.includes("/barn.png"));
    const { loadTileSet } = await import("../tile-sheets");
    const pending = loadTileSet();
    await vi.runAllTimersAsync();
    const set = await pending;
    expect(set?.images.has("barn")).toBe(false);
    expect(set?.images.has("birds")).toBe(true);
    expect(requests.get("/scene-planner/tiles/barn.png?v=test")).toBe(3);
  });

  it("lets a later caller fetch a main sheet that recovered", async () => {
    let down = true;
    const requests = mockImages((src) => down && src.includes("/barn.png"));
    const { loadTileSet, currentTileSet } = await import("../tile-sheets");
    const first = loadTileSet();
    await vi.runAllTimersAsync();
    const partial = await first;
    expect(currentTileSet()).toBe(partial);
    down = false;
    const second = loadTileSet();
    expect(second).not.toBe(first);
    await vi.runAllTimersAsync();
    const set = await second;
    expect(set?.images.has("barn")).toBe(true);
    expect(currentTileSet()).toBe(set);
    expect(requests.get("/scene-planner/tiles/barn.png?v=test")).toBe(4);
    expect(loadTileSet()).toBe(second);
  });

  it("retries a transient index failure inside the original call", async () => {
    mockImages(() => false);
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockRejectedValueOnce(new Error("offline"));
    const { loadTileSet } = await import("../tile-sheets");
    const pending = loadTileSet();
    await vi.runAllTimersAsync();
    expect((await pending)?.images.size).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("stops after three attempts, then lets a later caller try again", async () => {
    mockImages(() => false);
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockRejectedValue(new Error("offline"));
    const { loadTileSet, currentTileSet } = await import("../tile-sheets");
    const pending = loadTileSet();
    await vi.runAllTimersAsync();
    expect(await pending).toBeNull();
    expect(currentTileSet()).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(3);
    fetch.mockResolvedValue({ ok: true, json: async () => index } as Response);
    const retried = loadTileSet();
    await vi.runAllTimersAsync();
    expect((await retried)?.images.size).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(4);
  });
});
