import { describe, expect, it } from "vitest";
import { ANONYMOUS, isAdminIdentity } from "./identity";

describe("admin identity", () => {
  it("compares allowlist entries and rejects anonymous callers", () => {
    const identity = { tokenIdentifier: "issuer|subject" };
    expect(
      isAdminIdentity(identity, {
        QUICK_SHARE_ADMIN_TOKEN_IDENTIFIERS: "other, issuer|subject",
      }),
    ).toBe(true);
    expect(
      isAdminIdentity(identity, {
        QUICK_SHARE_ADMIN_TOKEN_IDENTIFIERS: "issuer|subjecT",
      }),
    ).toBe(false);
    expect(isAdminIdentity(ANONYMOUS, process.env)).toBe(false);
  });
});
