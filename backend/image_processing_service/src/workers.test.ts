import { EventEmitter } from "node:events";
import { Worker } from "node:worker_threads";
import { captureException } from "@sentry/node";
import { beforeEach, expect, it, vi } from "vitest";
import { ProcessingError } from "./utils/image.ts";
import { runJob, workerExecArgv } from "./workers.ts";

const state = vi.hoisted(() => ({ worker: undefined as unknown }));
vi.mock("node:worker_threads", async () => {
  const { EventEmitter } = await import("node:events");
  return {
    Worker: vi.fn(function () {
      const worker = Object.assign(new EventEmitter(), {
        terminate: vi.fn().mockResolvedValue(0),
      });
      state.worker = worker;
      return worker;
    }),
  };
});
vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

it("removes only the instrument preload, preserving strip-types and other imports", () => {
  const instrument = new URL("./instrument.ts", import.meta.url);
  const args = [
    "--experimental-strip-types",
    "--import",
    "tsx",
    "--enable-source-maps",
    "--import",
    `${process.cwd()}/src/instrument.ts`,
    `--import=${instrument.href}`,
    "--import=./other.ts",
  ];
  expect(workerExecArgv(args)).toEqual([
    "--experimental-strip-types",
    "--import",
    "tsx",
    "--enable-source-maps",
    "--import=./other.ts",
  ]);
  expect(workerExecArgv(["--import", "./src/instrument.ts"])).toEqual([]);
  expect(args).toHaveLength(8);
});

it.each(["error", "message", "validation", "success"])(
  "captures %s outcomes in the main thread only when unexpected",
  async (outcome) => {
    const instrument = new URL("./instrument.ts", import.meta.url).href;
    const originalArgs = process.execArgv;
    process.execArgv = ["--experimental-strip-types", "--import", instrument];
    try {
      const promise = runJob(
        "process",
        {} as Parameters<typeof runJob>[1],
        new AbortController().signal,
      );
      const worker = state.worker as EventEmitter & {
        terminate: ReturnType<typeof vi.fn>;
      };
      expect(Worker).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          execArgv: ["--experimental-strip-types"],
        }),
      );
      const error = new Error("worker failure");
      if (outcome === "error") worker.emit("error", error);
      else if (outcome === "message")
        worker.emit("message", { error: "Public error", exception: error });
      else if (outcome === "validation")
        worker.emit("message", { error: "Invalid image" });
      else worker.emit("message", { result: { ok: true } });
      if (outcome === "success")
        await expect(promise).resolves.toEqual({ ok: true });
      else await expect(promise).rejects.toBeInstanceOf(ProcessingError);
      if (outcome === "message" || outcome === "error")
        expect(captureException).toHaveBeenCalledExactlyOnceWith(error);
      else expect(captureException).not.toHaveBeenCalled();
      expect(worker.terminate).toHaveBeenCalledOnce();
    } finally {
      process.execArgv = originalArgs;
    }
  },
);
