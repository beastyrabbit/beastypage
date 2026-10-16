import "server-only";

import { dataBackend } from "./server/backend";
import { isMaintenanceMode } from "./server/maintenance";

const JOB_SHUTDOWN_TIMEOUT_MS = 30_000;

function shouldStartJobs(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  if (env.NEXT_RUNTIME !== "nodejs") return false;
  if (env.NEXT_PHASE === "phase-production-build") return false;
  if (env.JOBS_ENABLED === "0") return false;
  if (isMaintenanceMode(env)) return false;
  return dataBackend(env) === "postgres";
}

export async function register() {
  // The literal NEXT_RUNTIME check lets Next drop the worker from the Edge
  // instrumentation bundle; shouldStartJobs repeats it for tests.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!shouldStartJobs()) return;
  const globals = globalThis as typeof globalThis & {
    __beastypageJobWorker?: Promise<{ stop(): Promise<void> }>;
  };
  if (globals.__beastypageJobWorker) return;

  const workerPromise = import("./server/jobs/worker").then(
    ({ startJobWorker }) => startJobWorker(),
  );
  globals.__beastypageJobWorker = workerPromise;
  registerJobShutdown(workerPromise, async () => {
    const { stopLiveListener } = await import("./server/live/listener");
    await stopLiveListener();
  });
  workerPromise.catch((error) => {
    console.error(
      "[jobs] worker failed to start",
      error instanceof Error ? error.message : error,
    );
    globals.__beastypageJobWorker = undefined;
  });
}

export function registerJobShutdown(
  workerPromise: Promise<{ stop(): Promise<void> }>,
  stopLive: () => Promise<void>,
): void {
  const globals = globalThis as typeof globalThis & {
    __beastypageJobShutdownRegistered?: boolean;
  };
  if (globals.__beastypageJobShutdownRegistered) return;
  globals.__beastypageJobShutdownRegistered = true;

  const shutdown = async () => {
    const workerStop = workerPromise.then((worker) => worker.stop());
    await Promise.allSettled([
      withTimeout(workerStop, JOB_SHUTDOWN_TIMEOUT_MS),
      Promise.resolve().then(stopLive),
    ]);
  };
  process.once("SIGTERM", () => void shutdown());
  process.once("SIGINT", () => void shutdown());
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export { shouldStartJobs };
