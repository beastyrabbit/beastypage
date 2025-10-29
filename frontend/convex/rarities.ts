import { mutation, query } from "./_generated/server.js";
import type { MutationCtx } from "./_generated/server.js";
import type { Doc } from "./_generated/dataModel.js";
import { docIdToString } from "./utils.js";

type RarityDoc = Doc<"rarity">;

export type RarityPayload = ReturnType<typeof rarityRecordToClient>;

export const DEFAULT_RARITIES: Array<{
  name: string;
  chancePercent: number;
  stars: number;
}> = [
  { name: "Moondust", chancePercent: 40, stars: 1 },
  { name: "Starborn", chancePercent: 25, stars: 2 },
  { name: "Lunara", chancePercent: 15, stars: 3 },
  { name: "Celestara", chancePercent: 10, stars: 4 },
  { name: "Divinara", chancePercent: 6, stars: 5 },
  { name: "Holo Nova", chancePercent: 3, stars: 6 },
  { name: "Singularity", chancePercent: 1, stars: 7 }
];

export const list = query({
  args: {},
  handler: async (ctx) => {
    const rarities = await ctx.db.query("rarity").collect();
    rarities.sort((a, b) => (a.stars ?? 0) - (b.stars ?? 0));
    return rarities.map((doc) => rarityRecordToClient(doc));
  }
});

export const totalCount = query({
  args: {},
  handler: async (ctx) => {
    let count = 0;
    for await (const _ of ctx.db.query("rarity")) {
      count += 1;
    }
    return count;
  }
});

export const ensureDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    await upsertDefaultRarities(ctx, Date.now());
  }
});

function rarityRecordToClient(doc: RarityDoc) {
  return {
    id: docIdToString(doc._id),
    rarity_name: doc.rarityName,
    stars: doc.stars ?? null,
    chance_percent: doc.chancePercent ?? null,
    created: doc.createdAt,
    updated: doc.updatedAt
  };
}

export async function upsertDefaultRarities(ctx: Pick<MutationCtx, "db">, now: number) {
  const { db } = ctx;
  for (const rarity of DEFAULT_RARITIES) {
    const existing = await db
      .query("rarity")
      .withIndex("byName", (q) => q.eq("rarityName", rarity.name))
      .first();

    if (existing) {
      const needsUpdate =
        existing.chancePercent !== rarity.chancePercent ||
        existing.stars !== rarity.stars;

      if (needsUpdate) {
        await db.patch(existing._id, {
          chancePercent: rarity.chancePercent,
          stars: rarity.stars,
          updatedAt: now
        });
      }
    } else {
      await db.insert("rarity", {
        rarityName: rarity.name,
        chancePercent: rarity.chancePercent,
        stars: rarity.stars,
        createdAt: now,
        updatedAt: now
      });
    }
  }
}
