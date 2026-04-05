import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const databasePath = process.env.DATABASE_PATH ?? "data/stream-canvas.db";
const uploadsDir = process.env.UPLOADS_DIR ?? "data/uploads";

// Ensure data directories exist
for (const dir of [dirname(databasePath), uploadsDir]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export const config = {
  port: Number(process.env.PORT ?? 8003),
  databasePath,
  uploadsDir,
  /** Clerk JWKS public key for networkless JWT verification. */
  clerkJwtKey: process.env.CLERK_JWT_KEY ?? "",
  /** Clerk secret key — needed to fetch JWKS when jwtKey is not set. */
  clerkSecretKey: process.env.CLERK_SECRET_KEY ?? "",
  /** Clerk publishable key (used for issuer validation). */
  clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY ?? "",
  /** Allowed origins for CORS and WebSocket upgrade validation. */
  corsOrigins: process.env.CORS_ORIGINS?.split(",") ?? [
    "http://localhost:3000",
    "http://frontend.localhost:1355",
    "https://frontend.localhost:1355",
  ],
  /** TTL for short-lived OBS tokens in seconds. */
  obsTokenTtlSeconds: Number(process.env.OBS_TOKEN_TTL ?? 300),
} as const;
