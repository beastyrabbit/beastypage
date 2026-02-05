import { createOpenAPIProxyHandler } from "../../_lib/openapi-proxy";

export const GET = createOpenAPIProxyHandler({
  envVar: "IMAGE_PROCESSING_INTERNAL_URL",
  fallbackUrl: "http://127.0.0.1:8002",
  serviceName: "Image processing",
});
