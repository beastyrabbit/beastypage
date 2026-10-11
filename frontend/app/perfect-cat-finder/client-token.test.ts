import { describe, expect, it } from "vitest";
import { createPerfectCatClientId } from "./client-token";

describe("Perfect Cat client identity", () => {
  it("creates a new page-scoped identity for every instance", () => {
    const first = createPerfectCatClientId();
    const second = createPerfectCatClientId();

    expect(first).toEqual(expect.any(String));
    expect(first.length).toBeGreaterThan(0);
    expect(second).not.toBe(first);
  });
});
