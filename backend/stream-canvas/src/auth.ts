import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "./config.ts";
import type { ClerkClaims, ObsTokenClaims } from "./types.ts";

// ---------------------------------------------------------------------------
// Clerk JWT verification — uses jwtKey for local (networkless) verification
// when set, otherwise falls back to secretKey (requires network).
// ---------------------------------------------------------------------------

/** Lazy-load @clerk/backend once, then reuse. */
let clerkBackend: typeof import("@clerk/backend") | undefined;

/** Verify a Clerk JWT and return the decoded claims. */
export async function verifyClerkJwt(token: string): Promise<ClerkClaims> {
  clerkBackend ??= await import("@clerk/backend");

  const payload = await clerkBackend.verifyToken(token, {
    jwtKey: config.clerkJwtKey || undefined,
    secretKey: config.clerkSecretKey || undefined,
  });

  return payload as unknown as ClerkClaims;
}

// ---------------------------------------------------------------------------
// Short-lived OBS tokens (HMAC-signed)
// ---------------------------------------------------------------------------

const OBS_TOKEN_SECRET =
  process.env.OBS_TOKEN_SIGNING_SECRET ?? randomBytes(32).toString("hex");

if (!process.env.OBS_TOKEN_SIGNING_SECRET) {
  console.warn(
    "[stream-canvas] OBS_TOKEN_SIGNING_SECRET not set — using random secret. OBS tokens will not survive restarts.",
  );
}
if (!config.clerkJwtKey && !config.clerkSecretKey) {
  console.warn(
    "[stream-canvas] Neither CLERK_JWT_KEY nor CLERK_SECRET_KEY is set. All authenticated requests will fail.",
  );
}

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
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf))
    return null;

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
