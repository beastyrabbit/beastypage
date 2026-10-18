import { afterEach, describe, expect, it, vi } from "vitest";

const { verifyToken } = vi.hoisted(() => ({ verifyToken: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), verifyToken }));

import {
  ANONYMOUS,
  identityFromForwardedToken,
  isAdminIdentity,
} from "./identity";

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

describe("forwarded identity tokens", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    verifyToken.mockReset();
  });

  it("verifies the historical template audience and keeps the stable identifier", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_fixture");
    verifyToken.mockResolvedValue({
      iss: "https://clerk.example.com",
      sub: "user_123",
    });
    await expect(identityFromForwardedToken("jwt")).resolves.toEqual({
      tokenIdentifier: "https://clerk.example.com|user_123",
    });
    expect(verifyToken).toHaveBeenCalledWith("jwt", {
      secretKey: "sk_test_fixture",
      audience: "convex",
    });
  });

  it("rejects tokens Clerk cannot verify or that lack a subject", async () => {
    verifyToken.mockRejectedValueOnce(new Error("expired"));
    await expect(identityFromForwardedToken("jwt")).rejects.toThrow("expired");
    verifyToken.mockResolvedValueOnce({ iss: "https://clerk.example.com" });
    await expect(identityFromForwardedToken("jwt")).rejects.toThrow(
      "Invalid identity token",
    );
  });
});
