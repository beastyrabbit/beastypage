import "server-only";
import { timingSafeEqual } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { ServiceError } from "@/server/errors";

/**
 * Who is calling. `tokenIdentifier` uses Convex's format, `<iss>|<sub>`, so
 * owner columns, users.token_identifier and admin allowlists carry over
 * unchanged (ADR §9). Null for anonymous callers.
 */
export interface Identity {
  tokenIdentifier: string | null;
  nickname?: string;
  name?: string;
  email?: string;
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
  const claims = sessionClaims as Record<string, unknown>;
  const stringClaim = (...keys: string[]) => {
    for (const key of keys) {
      const value = claims[key];
      if (typeof value === "string" && value.trim()) return value;
    }
    return undefined;
  };
  return {
    tokenIdentifier: tokenIdentifierFor(issuer, userId),
    nickname: stringClaim("nickname"),
    name: stringClaim("name"),
    email: stringClaim("email", "email_address"),
  };
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
