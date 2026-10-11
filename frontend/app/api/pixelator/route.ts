import { createImageProcessingProxyHandler } from "@/app/api/_lib/image-processing-proxy";

export const POST = createImageProcessingProxyHandler({
  endpoint: "process",
  timeoutMs: 60_000,
  timeoutMessage: "Processing timed out",
  // Preserve the previous route contract for full-resolution images. The
  // image-processing service still enforces decoded-byte and pixel limits.
  maxBodyBytes: 60 * 1024 * 1024,
});
