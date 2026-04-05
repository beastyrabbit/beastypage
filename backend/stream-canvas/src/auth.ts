import { createHmac, randomBytes } from "node:crypto";
import { config } from "./config.ts";
import type { ClerkClaims, ObsTokenClaims } from "./types.ts";

// ---------------------------------------------------------------------------
// Clerk JWT verification (networkless via JWKS public key)
// ---------------------------------------------------------------------------

let verifyClerkToken: ((token: string) => Promise<ClerkClaims>) | null = null;

async function getClerkVerifier() {
  if (verifyClerkToken) return verifyClerkToken;

  const { verifyToken } = await import("@clerk/backend");

  verifyClerkToken = async (token: string): Promise<ClerkClaims> => {
    const payload = await verifyToken(token, {
      jwtKey: config.clerkJwtKey || undefined,
      secretKey: config.clerkSecretKey || undefined,
    });
    return payload as unknown as ClerkClaims;
  };

  return verifyClerkToken;
}

/**
 * Verify a Clerk JWT and return the decoded claims.
 * Uses `jwtKey` for networkless verification when available.
 */
export async function verifyClerkJwt(token: string): Promise<ClerkClaims> {
  const verify = await getClerkVerifier();
  return verify(token);
}

// ---------------------------------------------------------------------------
// Short-lived OBS tokens (HMAC-signed)
// ---------------------------------------------------------------------------

const OBS_TOKEN_SECRET =
  process.env.OBS_TOKEN_SIGNING_SECRET ?? randomBytes(32).toString("hex");

function hmacSign(payload: string): string {
  return createHmac("sha256", OBS_TOKEN_SECRET)
    .update(payload)
    .digest("base64url");
}

/** Mint a short-lived OBS token for a given room. */
export function mintObsToken(roomId: string): string {
  const claims: ObsTokenClaims = {
    roomId,
    role: "obs",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + config.obsTokenTtlSeconds,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = hmacSign(payload);
  return `${payload}.${signature}`;
}

/** Verify and decode a short-lived OBS token. Returns null if invalid. */
export function verifyObsToken(token: string): ObsTokenClaims | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = hmacSign(payload);
  if (signature !== expected) return null;

  try {
    const claims: ObsTokenClaims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf-8"),
    );
    if (claims.exp < Math.floor(Date.now() / 1000)) return null;
    if (claims.role !== "obs") return null;
    return claims;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// HTTP header helpers
// ---------------------------------------------------------------------------

/** Extract a Bearer token from an Authorization header value. */
export function extractBearer(header: string | undefined): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7);
}

/** Validate the Origin header against allowed origins. */
export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return false;
  return config.corsOrigins.includes(origin);
}
