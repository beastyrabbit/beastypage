import { createImageProcessingProxyHandler } from "@/app/api/_lib/image-processing-proxy";

export const POST = createImageProcessingProxyHandler({
  endpoint: "process",
  timeoutMs: 60_000,
  timeoutMessage: "Processing timed out",
});
