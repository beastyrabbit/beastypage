import { describe, expect, it } from "vitest";
import { issuerModeMatches } from "./verify-import";

describe("import issuer report mode", () => {
  it("requires verify arguments to match the import report", () => {
    expect(
      issuerModeMatches(
        { mode: "expected", expectedIssuer: "https://issuer.test" },
        { mode: "expected", expectedIssuer: "https://issuer.test" },
      ),
    ).toBe(true);
    expect(
      issuerModeMatches(
        { mode: "any", expectedIssuer: null },
        { mode: "expected", expectedIssuer: "https://issuer.test" },
      ),
    ).toBe(false);
  });
});
