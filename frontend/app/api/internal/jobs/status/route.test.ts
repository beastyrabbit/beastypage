import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getRequestIdentity = vi.fn();

vi.mock("@/server/auth/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth/identity")>()),
  getRequestIdentity,
}));

describe("GET /api/internal/jobs/status", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.DATA_BACKEND = "postgres";
    process.env.QUICK_SHARE_ADMIN_TOKEN_IDENTIFIERS = "iss|admin";
    getRequestIdentity.mockResolvedValue({ tokenIdentifier: null });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("denies an anonymous identity before reading the database", async () => {
    const { GET } = await import("./route");
    const response = await GET();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Forbidden",
      code: "forbidden",
    });
  });
});
