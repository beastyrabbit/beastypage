function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envString(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  port: envInt("PORT", 8002),
  corsOrigins: envString("CORS_ORIGINS", "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  maxImageSize: envInt("MAX_IMAGE_SIZE", 52_428_800),
  maxDimension: envInt("MAX_DIMENSION", 8000),
  previewMaxDimension: envInt("PREVIEW_MAX_DIMENSION", 1200),
  requestTimeout: envInt("REQUEST_TIMEOUT", 30_000),
} as const;
