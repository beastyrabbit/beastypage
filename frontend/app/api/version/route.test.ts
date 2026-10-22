import { afterEach, describe, expect, it, vi } from "vitest";
import { dynamic, GET } from "./route";

describe("version route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports the baked-in build version without caching", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "v11.2.0");
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ version: "v11.2.0" });
    expect(dynamic).toBe("force-dynamic");
  });

  it("reports dev for an unversioned build", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", undefined);
    expect(await GET().json()).toEqual({ version: "dev" });
  });
});
