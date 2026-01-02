export function normalizeConvexUrl(url: string): string {
  return url.replace(/\/$/, "");
}

export function requireClientConvexUrl(): string {
  const rawConvexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!rawConvexUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL must be defined to initialize Convex.");
  }

  return normalizeConvexUrl(rawConvexUrl);
}

export function getServerConvexUrl(): string | null {
  const rawConvexUrl =
    process.env.CONVEX_URL ||
    process.env.CONVEX_SITE_ORIGIN ||
    process.env.CONVEX_SELF_HOSTED_URL ||
    process.env.NEXT_PUBLIC_CONVEX_URL ||
    null;

  return rawConvexUrl ? normalizeConvexUrl(rawConvexUrl) : null;
}
