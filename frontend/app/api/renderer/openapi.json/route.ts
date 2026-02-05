import { createOpenAPIProxyHandler } from "../../_lib/openapi-proxy";

export const GET = createOpenAPIProxyHandler({
  envVar: "RENDERER_INTERNAL_URL",
  fallbackUrl: "http://127.0.0.1:8001",
  serviceName: "Renderer",
});
