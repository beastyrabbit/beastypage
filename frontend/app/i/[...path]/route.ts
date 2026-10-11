const MEDIA_SERVICE_URL =
  process.env.MEDIA_SERVICE_INTERNAL_URL ?? "http://127.0.0.1:8003";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function upstreamUrl(request: Request) {
  const incoming = new URL(request.url);
  const base = new URL(MEDIA_SERVICE_URL);
  base.pathname = incoming.pathname;
  base.search = incoming.search;
  return base;
}

function isInternalPath(request: Request) {
  const rawPathname = new URL(request.url).pathname;
  let pathname = rawPathname;
  // The canonical worker endpoint is authenticated by the media service and
  // must remain reachable through this public base URL. Reject encoded forms
  // that could bypass an upstream path policy by decoding a bounded number of
  // times and only blocking when decoding changes an internal path.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      // Malformed paths are not public media paths; fail closed.
      return true;
    }
    if (decoded === pathname) {
      return rawPathname !== decoded && decoded.includes("/api/internal/");
    }
    pathname = decoded;
  }
  return rawPathname !== pathname && pathname.includes("/api/internal/");
}

async function proxy(request: Request) {
  if (isInternalPath(request))
    return new Response("Not found", { status: 404 });
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  const upstream = await fetch(upstreamUrl(request), init);
  const responseHeaders = new Headers(upstream.headers);
  for (const header of HOP_BY_HOP_HEADERS) responseHeaders.delete(header);
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const OPTIONS = proxy;
