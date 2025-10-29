import { NextResponse, type NextRequest } from "next/server";

const DEFAULT_REDIRECT = normalizeRoute(process.env.NEXT_ENTRY_REDIRECT);
const HOST_ROUTE_MAP = parseHostMap(process.env.NEXT_ENTRY_HOST_MAP);

function parseHostMap(raw: string | undefined) {
  if (!raw) return {} as Record<string, string>;
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, value]) => typeof value === "string")
        .map(([key, value]) => [key.toLowerCase(), normalizeRoute(value)])
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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
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
  matcher: ["/"],
};
