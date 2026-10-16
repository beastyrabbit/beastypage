import { describe, expect, it } from "vitest";
import { shouldStartJobs } from "./instrumentation";

describe("job instrumentation startup guard", () => {
  it("only starts a PostgreSQL worker in the Node runtime", () => {
    expect(shouldStartJobs({})).toBe(false);
    expect(
      shouldStartJobs({ NEXT_RUNTIME: "nodejs", DATA_BACKEND: "convex" }),
    ).toBe(false);
    expect(
      shouldStartJobs({
        NEXT_RUNTIME: "nodejs",
        NEXT_PHASE: "phase-production-build",
        DATA_BACKEND: "postgres",
      }),
    ).toBe(false);
    expect(
      shouldStartJobs({
        NEXT_RUNTIME: "nodejs",
        DATA_BACKEND: "postgres",
        JOBS_ENABLED: "0",
      }),
    ).toBe(false);
    expect(
      shouldStartJobs({ NEXT_RUNTIME: "nodejs", DATA_BACKEND: "postgres" }),
    ).toBe(true);
  });

  it("does not start a worker in maintenance mode", () => {
    expect(
      shouldStartJobs({
        NEXT_RUNTIME: "nodejs",
        DATA_BACKEND: "postgres",
        MAINTENANCE_MODE: "1",
      }),
    ).toBe(false);
  });
});
