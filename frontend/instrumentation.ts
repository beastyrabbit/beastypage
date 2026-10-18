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
