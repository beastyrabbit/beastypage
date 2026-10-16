import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

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
});
