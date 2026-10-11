import { createImageProcessingProxyHandler } from "@/app/api/_lib/image-processing-proxy";

export const POST = createImageProcessingProxyHandler({
  endpoint: "detect-grid",
  timeoutMs: 30_000,
  timeoutMessage: "Detection timed out",
  upstreamLabel: "detect-grid",
});
