import { parentPort, workerData } from "node:worker_threads";
import { captureException, flush } from "@sentry/node";
import { processJob } from "./processing.ts";
import { ProcessingError } from "./utils/image.ts";

try {
  parentPort!.postMessage({ result: await processJob(workerData.kind, workerData.request) });
} catch (error) {
  if (!(error instanceof ProcessingError)) {
    captureException(error);
    await flush(2000);
  }
  parentPort!.postMessage({ error: error instanceof ProcessingError ? error.message : "Image or pipeline could not be processed within the service limits" });
}
