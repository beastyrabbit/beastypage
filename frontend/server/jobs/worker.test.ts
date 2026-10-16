import { describe, expect, it } from "vitest";
import { shouldClaimJobs } from "./worker";

describe("job claim maintenance gate", () => {
  it("stops claiming while maintenance is enabled", () => {
    expect(shouldClaimJobs({ MAINTENANCE_MODE: "1" })).toBe(false);
  });

  it("allows claims when maintenance is disabled", () => {
    expect(shouldClaimJobs({})).toBe(true);
  });
});
