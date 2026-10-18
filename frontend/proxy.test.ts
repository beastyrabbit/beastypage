import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { routeRequest } from "./proxy";

const originalMaintenance = process.env.MAINTENANCE_MODE;

function request(method: string, path: string) {
  return new NextRequest(`http://localhost${path}`, { method });
}

afterEach(() => {
  if (originalMaintenance === undefined) delete process.env.MAINTENANCE_MODE;
  else process.env.MAINTENANCE_MODE = originalMaintenance;
});

describe("maintenance proxy gate", () => {
  it("blocks API and media writes with the unavailable contract", async () => {
    process.env.MAINTENANCE_MODE = "1";
    for (const path of ["/api/cats/profile", "/i/api/internal/jobs/1"]) {
      const response = routeRequest(request("POST", path));
      expect(response.status).toBe(503);
      expect(response.headers.get("retry-after")).toBe("60");
      await expect(response.json()).resolves.toEqual({
        error: "Service is in maintenance mode",
        code: "unavailable",
      });
    }
  });

  it("leaves reads and database health available", () => {
    process.env.MAINTENANCE_MODE = "1";
    expect(routeRequest(request("GET", "/api/cats/profile")).status).toBe(200);
    expect(routeRequest(request("POST", "/api/health/database")).status).toBe(
      200,
    );
  });

  it("keeps the existing proxy behavior when the gate is off", () => {
    delete process.env.MAINTENANCE_MODE;
    expect(routeRequest(request("POST", "/api/cats/profile")).status).toBe(200);
  });
});
