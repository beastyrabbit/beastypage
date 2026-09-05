// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, expect, it, vi } from "vitest";
import { GET, PATCH } from "@/app/api/discord/user-config/route";
import {
  assertPublicAddresses,
  validateImageUrl,
} from "@/lib/public-image-download";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("denies preference requests before any backend work", async () => {
  vi.stubEnv("DISCORD_API_TOKEN", crypto.randomUUID());
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  expect(
    (
      await GET(
        new NextRequest(
          "https://app.example/api/discord/user-config?discordUserId=fixture",
        ),
      )
    ).status,
  ).toBe(401);
  expect(
    (
      await PATCH(
        new NextRequest("https://app.example/api/discord/user-config", {
          method: "PATCH",
          body: "{}",
        }),
      )
    ).status,
  ).toBe(401);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("applies a public-only address policy and standard-port URL contract", () => {
  expect(() =>
    assertPublicAddresses([{ address: "127.0.0.1", family: 4 }]),
  ).toThrow("public");
  expect(() => assertPublicAddresses([])).toThrow("no address");
  expect(() =>
    assertPublicAddresses([{ address: "8.8.8.8", family: 4 }]),
  ).not.toThrow();
  expect(() => validateImageUrl("https://image.example:8080/test.png")).toThrow(
    "standard",
  );
  expect(validateImageUrl("https://image.example/test.png").hostname).toBe(
    "image.example",
  );
});
