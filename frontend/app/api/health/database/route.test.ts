import { afterEach, describe, expect, it, vi } from "vitest";

const getPool = vi.fn();
vi.mock("@/server/db/client", () => ({ getPool }));

describe("database health route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    getPool.mockReset();
  });

  it("reports an unreachable PostgreSQL database", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://app@127.0.0.1/db");
    getPool.mockReturnValue({
      query: vi.fn().mockRejectedValue(new Error("connection refused")),
    });
    const { GET } = await import("./route");
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      reason: "database unreachable",
    });
    expect(getPool).toHaveBeenCalledOnce();
  });
});
