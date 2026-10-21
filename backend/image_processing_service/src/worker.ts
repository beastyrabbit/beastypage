import { parentPort, workerData } from "node:worker_threads";
import { processJob } from "./processing.ts";
import { ProcessingError } from "./utils/image.ts";

try {
  parentPort!.postMessage({
    result: await processJob(workerData.kind, workerData.request),
  });
} catch (error) {
  let exception: Error | undefined;
  if (!(error instanceof ProcessingError)) {
    exception = error instanceof Error ? error : new Error(String(error));
  }
  parentPort!.postMessage({
    error:
      error instanceof ProcessingError
        ? error.message
        : "Image or pipeline could not be processed within the service limits",
    // Structured cloning preserves Error stacks for capture by the main thread.
    exception,
  });
}
