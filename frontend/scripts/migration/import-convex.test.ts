import { describe, expect, it, vi } from "vitest";
import { assertDatabaseTarget, issuerModeFor } from "./import/guards";

describe("import target and issuer guards", () => {
  it("requires an issuer unless loopback any-issuer mode is explicit", () => {
    expect(() => issuerModeFor(undefined, false, true)).toThrow(
      /expected-issuer is required/,
    );
    expect(issuerModeFor(undefined, true, true)).toEqual({
      mode: "any",
      expectedIssuer: null,
    });
    expect(() => issuerModeFor(undefined, true, false)).toThrow(/loopback/);
  });

  it("rejects conflicting issuer arguments", () => {
    expect(() => issuerModeFor("https://issuer.test", true, true)).toThrow(
      /either/,
    );
  });

  it("checks current_database before an import can write", async () => {
    const client = {
      query: vi.fn().mockResolvedValue({ rows: [{ name: "beastypage" }] }),
    };
    await assertDatabaseTarget(
      client as never,
      "postgresql://owner@127.0.0.1/beastypage",
      "beastypage",
      "test",
    );
    await expect(
      assertDatabaseTarget(
        client as never,
        "postgresql://owner@127.0.0.1/beastypage",
        "other",
        "test",
      ),
    ).rejects.toThrow(/expected other/);
  });
});
