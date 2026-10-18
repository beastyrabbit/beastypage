import { describe, expect, it } from "vitest";
import { shouldStartJobs } from "./instrumentation";

describe("job instrumentation startup guard", () => {
  it("starts by default without a runtime selector", () => {
    expect(shouldStartJobs({})).toBe(true);
    expect(shouldStartJobs({ NEXT_RUNTIME: "nodejs" })).toBe(true);
  });

  it("does not start during a production build", () => {
    expect(shouldStartJobs({ NEXT_PHASE: "phase-production-build" })).toBe(
      false,
    );
  });

  it("honors the explicit jobs and maintenance gates", () => {
    expect(shouldStartJobs({ JOBS_ENABLED: "0" })).toBe(false);
    expect(shouldStartJobs({ MAINTENANCE_MODE: "1" })).toBe(false);
  });
});
