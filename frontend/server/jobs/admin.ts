import "server-only";

import { timingSafeEqual } from "node:crypto";

/** The allowlist intentionally retains Convex's tokenIdentifier semantics. */
export function isJobsAdminTokenIdentifier(
  tokenIdentifier: string | null | undefined,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  if (!tokenIdentifier) return false;
  const candidates = (env.QUICK_SHARE_ADMIN_TOKEN_IDENTIFIERS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const given = Buffer.from(tokenIdentifier);
  return candidates.some((candidate) => {
    const expected = Buffer.from(candidate);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
