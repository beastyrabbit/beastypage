import "server-only";

const JOB_SHUTDOWN_TIMEOUT_MS = 30_000;

/**
 * Stop the job worker and the live listener on SIGTERM/SIGINT, once per
 * process. Lives outside instrumentation.ts so the Edge instrumentation
 * bundle never sees `process.once`.
 */
export function registerJobShutdown(
  workerPromise: Promise<{ stop(): Promise<void> }>,
  stopLive: () => Promise<void>,
): void {
  const globals = globalThis as typeof globalThis & {
    __beastypageJobShutdownRegistered?: boolean;
  };
  if (globals.__beastypageJobShutdownRegistered) return;
  globals.__beastypageJobShutdownRegistered = true;

  let worker: { stop(): Promise<void> } | undefined;
  const workerReady = workerPromise.then(
    (ready) => {
      worker = ready;
      return ready;
    },
    () => undefined,
  );
  const shutdown = async () => {
    // Next may exit immediately after its own signal cleanup. Calling stop()
    // synchronously when the worker is ready flips its stopping guard first;
    // in-flight jobs then drain on a best-effort basis and remain lease-safe.
    let workerStop: Promise<void>;
    if (worker) {
      try {
        workerStop = worker.stop();
      } catch (error) {
        workerStop = Promise.reject(error);
      }
    } else {
      workerStop = workerReady
        .then((ready) => ready?.stop())
        .then(() => undefined);
    }
    await Promise.allSettled([
      withTimeout(workerStop, JOB_SHUTDOWN_TIMEOUT_MS),
      stopLive().catch(() => undefined),
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
