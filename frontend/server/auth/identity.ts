import "server-only";
import { auth } from "@clerk/nextjs/server";

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
