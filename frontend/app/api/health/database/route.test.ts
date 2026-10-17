import { afterEach, describe, expect, it, vi } from "vitest";

const getPool = vi.fn();
vi.mock("@/server/db/client", () => ({ getPool }));

describe("database health route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    getPool.mockReset();
  });

  it("does not open a PostgreSQL pool while Convex is selected", async () => {
    vi.stubEnv("DATA_BACKEND", "convex");
    vi.stubEnv("DATABASE_URL", "postgresql://app@127.0.0.1/db");
    const { GET } = await import("./route");
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      reason: "postgres backend not selected",
    });
    expect(getPool).not.toHaveBeenCalled();
  });
});
