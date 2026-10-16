import { type NextRequest, NextResponse } from "next/server";

const DEFAULT_REDIRECT = normalizeRoute(process.env.NEXT_ENTRY_REDIRECT);
const HOST_ROUTE_MAP = parseHostMap(process.env.NEXT_ENTRY_HOST_MAP);
const RETRY_AFTER_SECONDS = "60";

const isMaintenanceWrite = (request: NextRequest): boolean => {
  if (process.env.MAINTENANCE_MODE !== "1") return false;
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return false;
  const { pathname } = request.nextUrl;
  if (!(pathname.startsWith("/api/") || pathname.startsWith("/i/api/"))) {
    return false;
  }
  // Health endpoints remain usable while the application is gated.
  const healthRoute =
    pathname === "/api/health" ||
    pathname.startsWith("/api/health/") ||
    pathname === "/i/api/health" ||
    pathname.startsWith("/i/api/health/");
  return !healthRoute;
};

export function maintenanceResponse(): NextResponse {
  return NextResponse.json(
    { error: "Service is in maintenance mode", code: "unavailable" },
    { status: 503, headers: { "Retry-After": RETRY_AFTER_SECONDS } },
  );
}

function parseHostMap(raw: string | undefined) {
  if (!raw) return {} as Record<string, string>;
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, value]) => typeof value === "string")
        .map(([key, value]) => [key.toLowerCase(), normalizeRoute(value)]),
    );
  } catch (error) {
    console.warn("Invalid NEXT_ENTRY_HOST_MAP JSON", error);
    return {};
  }
}

function normalizeRoute(route: string | undefined) {
  if (!route) return undefined;
  if (route === "/") return "/";
  return route.startsWith("/") ? route : `/${route}`;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isMaintenanceWrite(request)) return maintenanceResponse();
  if (pathname === "/quick-share" || pathname.startsWith("/quick-share/")) {
    const response = NextResponse.next();
    response.headers.set(
      "X-Robots-Tag",
      "noindex, nofollow, noarchive, nosnippet, noimageindex",
    );
    return response;
  }
  if (pathname !== "" && pathname !== "/") {
    return NextResponse.next();
  }

  const rawHost = request.headers.get("host")?.toLowerCase() ?? null;
  const host = rawHost ? rawHost.split(":")[0] : null;
  const hostRedirect = host ? HOST_ROUTE_MAP[host] : undefined;
  const target = hostRedirect ?? DEFAULT_REDIRECT;

  if (!target || target === "/") {
    return NextResponse.next();
  }

  const destination = request.nextUrl.clone();
  destination.pathname = target;
  return NextResponse.redirect(destination);
}

export const config = {
  matcher: ["/", "/quick-share/:path*", "/api/:path*", "/i/api/:path*"],
};
