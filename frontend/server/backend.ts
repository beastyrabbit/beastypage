/**
 * Which implementation serves a migrated area (ADR §8). `convex` stays the
 * default until the cutover; staging sets `DATA_BACKEND=postgres` to compare
 * results without changing the public API. Removed after the cutover (#117).
 */
export type DataBackend = "convex" | "postgres";

export function dataBackend(
  env: Readonly<Record<string, string | undefined>> = process.env,
): DataBackend {
  const value = env.DATA_BACKEND?.trim() || "convex";
  if (value !== "convex" && value !== "postgres") {
    throw new Error(
      `DATA_BACKEND must be "convex" or "postgres", got "${value}"`,
    );
  }
  return value;
}
