import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  subscribeLive: vi.fn(),
  waitForLiveReady: vi.fn(async () => undefined),
  findLiveTopic: vi.fn(),
  loadSnapshot: vi.fn(),
}));

vi.mock("@/server/backend", () => ({
  dataBackend: () => "postgres",
}));
vi.mock("@/server/auth/identity", () => ({
  ANONYMOUS: {},
  getRequestIdentity: vi.fn(),
}));
vi.mock("@/server/db/client", () => ({
  getDb: () => ({}),
}));
vi.mock("@/server/live/listener", () => ({
  subscribeLive: mocks.subscribeLive,
  waitForLiveReady: mocks.waitForLiveReady,
}));
vi.mock("@/server/live/topics", () => ({
  findLiveTopic: mocks.findLiveTopic,
}));

const { GET } = await import("./route");

describe("live SSE refresh scheduling", () => {
  beforeEach(() => {
    mocks.subscribeLive.mockReset();
    mocks.waitForLiveReady.mockReset().mockResolvedValue(undefined);
    mocks.findLiveTopic.mockReset();
    mocks.loadSnapshot.mockReset();
  });

  it("coalesces a burst into at most one pending snapshot load", async () => {
    const callbacks: Array<() => void> = [];
    mocks.subscribeLive.mockImplementation(
      (_topic: string, callback: () => void) => {
        callbacks.push(callback);
        return () => undefined;
      },
    );
    mocks.findLiveTopic.mockReturnValue({
      family: "test",
      parse: () => ({}),
      authorize: async () => ({}),
      loadSnapshot: mocks.loadSnapshot,
    });
    const snapshots: Array<{
      revision: number;
      data: unknown;
    }> = [
      { revision: 1, data: { value: 1 } },
      { revision: 2, data: { value: 2 } },
    ];
    const resolvers: Array<(value: (typeof snapshots)[number]) => void> = [];
    mocks.loadSnapshot.mockImplementation(
      () =>
        new Promise<(typeof snapshots)[number]>((resolve) => {
          resolvers.push(resolve);
        }),
    );

    const controller = new AbortController();
    const response = await GET(
      new NextRequest("http://localhost/api/live/test/burst", {
        signal: controller.signal,
      }),
      { params: Promise.resolve({ topic: ["test", "burst"] }) },
    );
    const reader = response.body?.getReader();
    if (!reader) throw new Error("SSE response has no body");
    const firstRead = reader.read();
    await vi.waitFor(() => expect(mocks.loadSnapshot).toHaveBeenCalledTimes(1));

    for (let index = 0; index < 100; index += 1) callbacks[0]?.();
    resolvers.shift()?.(snapshots[0]);
    await firstRead;
    await vi.waitFor(() => expect(mocks.loadSnapshot).toHaveBeenCalledTimes(2));

    const secondRead = reader.read();
    resolvers.shift()?.(snapshots[1]);
    await secondRead;
    expect(mocks.loadSnapshot).toHaveBeenCalledTimes(2);

    controller.abort();
    await reader.cancel();
  });

  it("retries a snapshot owed while the queue is full after the consumer reads", async () => {
    const callbacks: Array<() => void> = [];
    let revision = 0;
    mocks.subscribeLive.mockImplementation(
      (_topic: string, callback: () => void) => {
        callbacks.push(callback);
        return () => undefined;
      },
    );
    mocks.findLiveTopic.mockReturnValue({
      family: "test",
      parse: () => ({}),
      authorize: async () => ({}),
      loadSnapshot: mocks.loadSnapshot,
    });
    mocks.loadSnapshot.mockImplementation(async () => {
      revision += 1;
      return { revision, data: { revision } };
    });

    const controller = new AbortController();
    const response = await GET(
      new NextRequest("http://localhost/api/live/test/backpressure", {
        signal: controller.signal,
      }),
      { params: Promise.resolve({ topic: ["test", "backpressure"] }) },
    );
    const reader = response.body?.getReader();
    if (!reader) throw new Error("SSE response has no body");
    await vi.waitFor(() => expect(mocks.loadSnapshot).toHaveBeenCalledTimes(1));

    for (let index = 0; index < 7; index += 1) {
      callbacks[0]?.();
      await vi.waitFor(() =>
        expect(mocks.loadSnapshot).toHaveBeenCalledTimes(index + 2),
      );
    }
    callbacks[0]?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.loadSnapshot).toHaveBeenCalledTimes(8);

    const chunks: string[] = [];
    const first = await reader.read();
    if (first.value) chunks.push(new TextDecoder().decode(first.value));
    await vi.waitFor(() => expect(mocks.loadSnapshot).toHaveBeenCalledTimes(9));
    for (let index = 1; index < 9; index += 1) {
      const result = await reader.read();
      if (result.value) chunks.push(new TextDecoder().decode(result.value));
    }
    expect(chunks.some((chunk) => chunk.includes('"revision":9'))).toBe(true);

    controller.abort();
    await reader.cancel();
  });

  it("closes an unread stream after sustained backpressure", async () => {
    const callbacks: Array<() => void> = [];
    let revision = 0;
    mocks.subscribeLive.mockImplementation(
      (_topic: string, callback: () => void) => {
        callbacks.push(callback);
        return () => undefined;
      },
    );
    mocks.findLiveTopic.mockReturnValue({
      family: "test",
      parse: () => ({}),
      authorize: async () => ({}),
      loadSnapshot: mocks.loadSnapshot,
    });
    mocks.loadSnapshot.mockImplementation(async () => {
      revision += 1;
      return { revision, data: { revision } };
    });

    const response = await GET(
      new NextRequest("http://localhost/api/live/test/unread"),
      { params: Promise.resolve({ topic: ["test", "unread"] }) },
    );
    const reader = response.body?.getReader();
    if (!reader) throw new Error("SSE response has no body");
    await vi.waitFor(() => expect(mocks.loadSnapshot).toHaveBeenCalledTimes(1));
    for (let index = 0; index < 7; index += 1) {
      callbacks[0]?.();
      await vi.waitFor(() =>
        expect(mocks.loadSnapshot).toHaveBeenCalledTimes(index + 2),
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    for (let index = 0; index < 8; index += 1) await reader.read();
    await expect(reader.read()).resolves.toMatchObject({ done: true });
  });
});
