import { NextResponse } from "next/server";

interface OpenAPIProxyConfig {
  /** Environment variable name for the backend URL */
  envVar: string;
  /** Fallback URL when the env var is not set */
  fallbackUrl: string;
  /** Human-readable service name for error messages and log prefixes */
  serviceName: string;
}

const TIMEOUT_MS = 10_000;

/**
 * Creates a GET handler that proxies an OpenAPI spec from a backend service.
 * Caches the upstream response for one hour.
 */
export function createOpenAPIProxyHandler(
  config: OpenAPIProxyConfig,
): () => Promise<NextResponse> {
  const baseUrl = (process.env[config.envVar] ?? config.fallbackUrl).replace(
    /\/$/,
    "",
  );
  const logPrefix = `[${config.serviceName.toLowerCase()}-openapi-proxy]`;

  return async function GET(): Promise<NextResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const upstream = await fetch(`${baseUrl}/openapi.json`, {
        signal: controller.signal,
        next: { revalidate: 3600 },
      });
      clearTimeout(timeout);

      if (!upstream.ok) {
        const body = await upstream.text().catch(() => "");
        console.error(
          "%s upstream returned %d: %s",
          logPrefix,
          upstream.status,
          body.slice(0, 500),
        );
        return NextResponse.json(
          { error: `${config.serviceName} OpenAPI spec unavailable` },
          { status: upstream.status },
        );
      }

      let spec: unknown;
      try {
        spec = await upstream.json();
      } catch (parseError) {
        console.error("%s upstream returned non-JSON body", logPrefix, parseError);
        return NextResponse.json(
          { error: `${config.serviceName} returned invalid OpenAPI spec` },
          { status: 502 },
        );
      }

      return NextResponse.json(spec, {
        headers: { "cache-control": "public, max-age=3600" },
      });
    } catch (error) {
      clearTimeout(timeout);
      console.error("%s upstream error:", logPrefix, error);

      if (error instanceof DOMException && error.name === "AbortError") {
        return NextResponse.json(
          { error: `${config.serviceName} service timed out` },
          { status: 504 },
        );
      }

      return NextResponse.json(
        { error: `${config.serviceName} service unavailable` },
        { status: 502 },
      );
    }
  };
}
