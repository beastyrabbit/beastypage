import { parentPort, workerData } from "node:worker_threads";
import { processJob } from "./processing.ts";

try {
  parentPort!.postMessage({ result: await processJob(workerData.kind, workerData.request) });
} catch {
  parentPort!.postMessage({ error: "Image or pipeline could not be processed within the service limits" });
}
