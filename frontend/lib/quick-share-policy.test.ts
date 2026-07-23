import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  publicLifetimeMs,
  QUICK_SHARE_POLICY,
} from "@/convex/quickSharePolicy";

describe("Quick Share retention policy", () => {
  it("uses the anonymous 25 MiB boundary", () => {
    expect(
      publicLifetimeMs(
        "anonymous",
        QUICK_SHARE_POLICY.anonymous.smallCutoffBytes,
      ),
    ).toBe(7 * DAY_MS);
    expect(
      publicLifetimeMs(
        "anonymous",
        QUICK_SHARE_POLICY.anonymous.smallCutoffBytes + 1,
      ),
    ).toBe(DAY_MS);
  });

  it("uses the signed-in 250 MiB boundary", () => {
    expect(
      publicLifetimeMs(
        "signedIn",
        QUICK_SHARE_POLICY.signedIn.smallCutoffBytes,
      ),
    ).toBe(30 * DAY_MS);
    expect(
      publicLifetimeMs(
        "signedIn",
        QUICK_SHARE_POLICY.signedIn.smallCutoffBytes + 1,
      ),
    ).toBe(7 * DAY_MS);
  });
});
