import "server-only";
import { timingSafeEqual } from "node:crypto";
import { auth, verifyToken } from "@clerk/nextjs/server";
import { ServiceError } from "@/server/errors";

/**
 * Who is calling. `tokenIdentifier` uses Convex's format, `<iss>|<sub>`, so
 * owner columns, users.token_identifier and admin allowlists carry over
 * unchanged (ADR §9). Null for anonymous callers.
 */
export interface Identity {
  tokenIdentifier: string | null;
}

export const ANONYMOUS: Identity = { tokenIdentifier: null };

export function tokenIdentifierFor(issuer: string, subject: string): string {
  return `${issuer}|${subject}`;
}

/** Identity of the current request from the Clerk session. */
export async function getRequestIdentity(): Promise<Identity> {
  const { userId, sessionClaims } = await auth();
  const issuer = sessionClaims?.iss;
  if (!userId || typeof issuer !== "string" || issuer === "") return ANONYMOUS;
  return { tokenIdentifier: tokenIdentifierFor(issuer, userId) };
}

/**
 * Identity from a Clerk token another service forwarded, such as the media
 * service relaying a browser's Quick Share request. Browsers mint these from
 * the "convex" JWT template, which Clerk's session middleware rejects as the
 * wrong token type, so verify it directly with the same audience check Convex
 * used. Throws when the token is invalid or expired.
 */
export async function identityFromForwardedToken(
  token: string,
): Promise<Identity> {
  const claims = await verifyToken(token, {
    secretKey: process.env.CLERK_SECRET_KEY,
    audience: "convex",
  });
  if (typeof claims.iss !== "string" || !claims.iss || !claims.sub)
    throw new ServiceError("forbidden", "Invalid identity token");
  return { tokenIdentifier: tokenIdentifierFor(claims.iss, claims.sub) };
}

/** Require a Clerk identity for a route or service operation. */
export async function requireIdentity(): Promise<Identity> {
  const identity = await getRequestIdentity();
  if (!identity.tokenIdentifier) {
    throw new ServiceError("forbidden", "Authentication required");
  }
  return identity;
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

export function isAdminIdentity(
  identity: Identity,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  if (!identity.tokenIdentifier) return false;
  const allowlist = (env.QUICK_SHARE_ADMIN_TOKEN_IDENTIFIERS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return allowlist.some((entry) =>
    constantTimeEqual(identity.tokenIdentifier as string, entry),
  );
}

export async function requireAdmin(identity?: Identity): Promise<Identity> {
  const resolved = identity ?? (await requireIdentity());
  if (!isAdminIdentity(resolved)) {
    throw new ServiceError("forbidden", "Administrator access required");
  }
  return resolved;
}
