/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seedCats(t: ReturnType<typeof convexTest>) {
  await t.mutation(api.perfectCats.registerCats, {
    cats: [
      { params: { name: "first" } },
      { params: { name: "second" } },
      { params: { name: "third" } },
    ],
  });
}

describe("perfect cat matchups", () => {
  it("returns a redeemable capability for an anonymous request", async () => {
    const t = convexTest(schema, modules);
    await seedCats(t);

    const response = await t.mutation(api.perfectCats.requestMatchup, {});

    expect(response.cats).toHaveLength(2);
    expect(response.clientId).toEqual(expect.any(String));
    expect(response.matchupToken).toEqual(expect.any(String));
    const winner = response.cats[0];
    const loser = response.cats[1];
    if (!winner || !loser || !response.clientId || !response.matchupToken) {
      throw new Error("Expected a complete anonymous matchup");
    }
    await expect(
      t.mutation(api.perfectCats.submitVote, {
        clientId: response.clientId,
        winnerId: winner.id,
        loserId: loser.id,
        matchupToken: response.matchupToken,
      }),
    ).resolves.toMatchObject({ winner: { id: winner.id } });
    await expect(
      t.run((ctx) => ctx.db.query("perfect_matchups").collect()),
    ).resolves.toHaveLength(0);
  });

  it("keeps registered client matchups redeemable", async () => {
    const t = convexTest(schema, modules);
    await seedCats(t);

    const response = await t.mutation(api.perfectCats.requestMatchup, {
      clientId: "device-test",
    });
    expect(response.matchupToken).toEqual(expect.any(String));

    const winner = response.cats[0];
    const loser = response.cats[1];
    if (!winner || !loser || !response.matchupToken) {
      throw new Error("Expected a complete matchup");
    }
    await expect(
      t.mutation(api.perfectCats.submitVote, {
        clientId: "device-test",
        winnerId: winner.id,
        loserId: loser.id,
        matchupToken: response.matchupToken,
      }),
    ).resolves.toMatchObject({ winner: { id: winner.id } });

    const legacyResponse = await t.mutation(api.perfectCats.requestMatchup, {
      clientId: "device-test",
    });
    const legacyWinner = legacyResponse.cats[0];
    const legacyLoser = legacyResponse.cats[1];
    if (!legacyWinner || !legacyLoser) {
      throw new Error("Expected a complete legacy matchup");
    }
    await expect(
      t.mutation(api.perfectCats.submitVote, {
        clientId: "device-test",
        winnerId: legacyWinner.id,
        loserId: legacyLoser.id,
      }),
    ).resolves.toMatchObject({ winner: { id: legacyWinner.id } });
  });

  it("deletes expired matchups in bounded batches", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      const cats = await Promise.all(
        ["first", "second"].map((name) =>
          ctx.db.insert("perfect_cats", {
            hash: name,
            params: { name },
            rating: 1500,
            wins: 0,
            losses: 0,
            appearances: 0,
            createdAt: now,
            updatedAt: now,
          }),
        ),
      );
      for (let index = 0; index < 101; index += 1) {
        await ctx.db.insert("perfect_matchups", {
          clientId: `expired-${index}`,
          catAId: cats[0],
          catBId: cats[1],
          token: `token-${index}`,
          createdAt: now - 2_000,
          expiresAt: now - 1_000,
          consumed: false,
        });
      }
      await ctx.db.insert("perfect_matchups", {
        clientId: "fresh",
        catAId: cats[0],
        catBId: cats[1],
        token: "fresh-token",
        createdAt: now,
        expiresAt: now + 60_000,
        consumed: false,
      });
    });

    await expect(
      t.mutation(internal.perfectCats.cleanupExpiredMatchups, {}),
    ).resolves.toEqual({ deleted: 100 });
    expect(
      await t.run((ctx) => ctx.db.query("perfect_matchups").collect()),
    ).toHaveLength(2);

    await t.mutation(internal.perfectCats.cleanupExpiredMatchups, {});
    const remaining = await t.run((ctx) =>
      ctx.db.query("perfect_matchups").collect(),
    );
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.clientId).toBe("fresh");
  });

  it("bounds active matchup capabilities across rotating client IDs", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      const cats = await Promise.all(
        ["first", "second"].map((name) =>
          ctx.db.insert("perfect_cats", {
            hash: name,
            params: { name },
            rating: 1500,
            wins: 0,
            losses: 0,
            appearances: 0,
            createdAt: now,
            updatedAt: now,
          }),
        ),
      );
      for (let index = 0; index < 600; index += 1) {
        await ctx.db.insert("perfect_matchups", {
          clientId: `active-${index}`,
          catAId: cats[0],
          catBId: cats[1],
          token: `token-${index}`,
          createdAt: now,
          expiresAt: now + 60_000,
          consumed: false,
        });
      }
    });

    await expect(
      t.mutation(api.perfectCats.requestMatchup, { clientId: "new-client" }),
    ).rejects.toThrow("matchups are temporarily full");
  });
});
