import { describe, expect, it, vi } from "vitest";

import { registerJobShutdown } from "./shutdown";

describe("job shutdown", () => {
  it("registers one shutdown handler per signal and stops both services", async () => {
    const globals = globalThis as typeof globalThis & {
      __beastypageJobShutdownRegistered?: boolean;
    };
    globals.__beastypageJobShutdownRegistered = undefined;
    const workerStop = vi.fn(async () => undefined);
    const liveStop = vi.fn(async () => undefined);
    const beforeTerm = process.listeners("SIGTERM");
    const beforeInt = process.listeners("SIGINT");

    registerJobShutdown(Promise.resolve({ stop: workerStop }), liveStop);
    registerJobShutdown(
      Promise.resolve({ stop: vi.fn(async () => undefined) }),
      vi.fn(async () => undefined),
    );

    expect(process.listenerCount("SIGTERM")).toBe(beforeTerm.length + 1);
    expect(process.listenerCount("SIGINT")).toBe(beforeInt.length + 1);
    await Promise.resolve();
    process.emit("SIGTERM");
    await vi.waitFor(() => {
      expect(workerStop).toHaveBeenCalledTimes(1);
      expect(liveStop).toHaveBeenCalledTimes(1);
    });

    for (const listener of process.listeners("SIGTERM")) {
      if (!beforeTerm.includes(listener))
        process.removeListener("SIGTERM", listener);
    }
    for (const listener of process.listeners("SIGINT")) {
      if (!beforeInt.includes(listener))
        process.removeListener("SIGINT", listener);
    }
    globals.__beastypageJobShutdownRegistered = undefined;
  });
});
