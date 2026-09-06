import { Worker } from "node:worker_threads";
import { HTTPException } from "hono/http-exception";
import { config } from "./config.ts";
import { ProcessingError } from "./utils/image.ts";
import type { processJob } from "./processing.ts";

let active = 0;

/** A bounded set of disposable workers. Termination also cancels synchronous algorithms. */
export async function runJob(kind: "process" | "detect", request: Parameters<typeof processJob>[1], signal: AbortSignal) {
  signal.throwIfAborted();
  if (active >= config.workers) throw new HTTPException(503, { message: "Image workers are busy. Try again shortly." });
  active++;
  let worker: Worker | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel = () => {};
  try {
    worker = new Worker(new URL("./worker.ts", import.meta.url), {
      workerData: { kind, request },
      resourceLimits: { maxOldGenerationSizeMb: 256 },
    });
    return await new Promise<Awaited<ReturnType<typeof processJob>>>((resolve, reject) => {
      cancel = () => reject(new DOMException("Request cancelled", "AbortError"));
      signal.addEventListener("abort", cancel, { once: true });
      timer = setTimeout(() => reject(new HTTPException(504, { message: "Image processing timed out" })), config.requestTimeout);
      worker!.once("message", message => message.error ? reject(new ProcessingError(message.error)) : resolve(message.result));
      worker!.once("error", () => reject(new ProcessingError("Image worker failed")));
      worker!.once("exit", () => reject(new ProcessingError("Image worker stopped")));
      if (signal.aborted) cancel();
    });
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
    if (worker) await worker.terminate();
    active--;
  }
}
