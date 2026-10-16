import "server-only";

import { dataBackend } from "./server/backend";
import { isMaintenanceMode } from "./server/maintenance";

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
  workerPromise.catch((error) => {
    console.error(
      "[jobs] worker failed to start",
      error instanceof Error ? error.message : error,
    );
    globals.__beastypageJobWorker = undefined;
  });
}

export { shouldStartJobs };
