/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { isDiscordServiceRequest } from "./discordAuth";
import schema from "./schema";
import { normalizeStorageUrl } from "./utils";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("stored data compatibility", () => {
  it("accepts legacy ancestry passwords containing surrogate pairs", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert("ancestry_tree", {
        slug: "legacy-tree",
        name: "Legacy",
        foundingMotherId: "mother",
        foundingFatherId: "father",
        cats: [],
        config: { minChildren: 1, maxChildren: 2, depth: 1, genderRatio: 0.5 },
        passwordHash: "-bdurt0-2e85",
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    await expect(
      t.mutation(api.ancestryTree.update, {
        slug: "legacy-tree",
        password: "🐈secret🐾",
        name: "Updated",
      }),
    ).resolves.toMatchObject({ success: true });
    await expect(
      t.mutation(api.ancestryTree.update, {
        slug: "legacy-tree",
        password: "wrong",
      }),
    ).resolves.toEqual({ success: false, error: "invalid_password" });
  });

  it("reuses existing cat ratings with UTF-16 hashes and code-unit key order", async () => {
    const t = convexTest(schema, modules);
    const id = await t.run((ctx) =>
      ctx.db.insert("perfect_cats", {
        hash: "b0cad0b",
        params: { A: "🐈", a: 1 },
        rating: 1720,
        wins: 4,
        losses: 1,
        appearances: 5,
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    const cats = await t.mutation(api.perfectCats.registerCats, {
      cats: [{ params: { a: 1, A: "🐈" } }],
    });
    expect(cats).toMatchObject([{ id, rating: 1720, wins: 4 }]);
    expect(
      await t.run((ctx) => ctx.db.query("perfect_cats").collect()),
    ).toHaveLength(1);
  });

  it.each([
    ["0123456789abcdef0123456789abcdef", "-47b9a877"],
    ["🐈compatibility", "2715c88c"],
  ])(
    "redeems stored fallback challenge hashes for salt %s",
    async (salt, answerHash) => {
      vi.stubEnv("DISCORD_INVITE_SECRET", "compatibility-fixture");
      vi.stubGlobal("crypto", {
        getRandomValues: globalThis.crypto.getRandomValues.bind(
          globalThis.crypto,
        ),
      });
      const t = convexTest(schema, modules);
      await t.run((ctx) =>
        ctx.db.insert("discord_challenge", {
          token: "fixture",
          answerHash,
          salt,
          createdAt: Date.now(),
          expiresAt: Date.now() + 60_000,
        }),
      );
      await expect(
        t.mutation(api.discord.redeemChallenge, {
          token: "fixture",
          answer: "12",
        }),
      ).resolves.toMatchObject({ status: "success" });
    },
  );

  it("preserves exact service token comparison and rejects a missing code unit", () => {
    vi.stubEnv(
      "DISCORD_API_TOKEN",
      "compatibility-fixture-token-for-tests-only",
    );
    expect(
      isDiscordServiceRequest(
        new Request("https://example.test", {
          headers: {
            authorization: "Bearer compatibility-fixture-token-for-tests-only",
          },
        }),
      ),
    ).toBe(true);
    expect(
      isDiscordServiceRequest(
        new Request("https://example.test", {
          headers: {
            authorization: "Bearer compatibility-fixture-token-for-tests-onl",
          },
        }),
      ),
    ).toBe(false);
  });

  it("honors toJSON when normalizing runtime storage URL wrappers", () => {
    const wrapped = { toJSON: () => "/api/storage/fixture" };
    expect(normalizeStorageUrl(wrapped as unknown as string)).toMatch(
      /\/api\/storage\/fixture$/,
    );
    expect(normalizeStorageUrl(null)).toBeNull();
  });
});
