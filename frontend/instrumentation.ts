import "server-only";

import { isMaintenanceMode } from "./server/maintenance";

function shouldStartJobs(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  if (env.NEXT_PHASE === "phase-production-build") return false;
  if (env.JOBS_ENABLED === "0") return false;
  if (isMaintenanceMode(env)) return false;
  return true;
}

export async function register() {
  if (
    process.env.NEXT_PUBLIC_APP_ENV === "production" &&
    process.env.NEXT_PUBLIC_GLITCHTIP_DSN
  ) {
    if (process.env.NEXT_RUNTIME === "nodejs")
      await import("./sentry.server.config");
    if (process.env.NEXT_RUNTIME === "edge")
      await import("./sentry.edge.config");
  }
  // Next replaces this literal at build time, which drops the worker from the
  // Edge instrumentation bundle. Do not move it into shouldStartJobs: the
  // running server has no NEXT_RUNTIME environment variable.
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
  workerPromise.catch((error) => {
    console.error(
      "[jobs] worker failed to start",
      error instanceof Error ? error.message : error,
    );
    globals.__beastypageJobWorker = undefined;
  });
  const { registerJobShutdown } = await import("./server/jobs/shutdown");
  registerJobShutdown(workerPromise, async () => {
    const { stopLiveListener } = await import("./server/live/listener");
    await stopLiveListener();
  });
}

export { shouldStartJobs };

export async function onRequestError(
  ...args: Parameters<typeof import("@sentry/nextjs").captureRequestError>
) {
  if (
    process.env.NEXT_PUBLIC_APP_ENV !== "production" ||
    !process.env.NEXT_PUBLIC_GLITCHTIP_DSN
  )
    return;
  const { captureRequestError } = await import("@sentry/nextjs");
  return captureRequestError(...args);
}
