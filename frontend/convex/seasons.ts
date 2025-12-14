import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import { docIdToString } from "./utils.js";

type SeasonDoc = Doc<"card_season">;

export type SeasonPayload = Awaited<ReturnType<typeof seasonRecordToClient>>;

export const DEFAULT_SEASONS: Array<{ name: string; shortName: string }> = [
  { name: "BETA", shortName: "BETA" },
  { name: "Season 1", shortName: "S1" }
];

export const list = query({
  args: {},
  handler: async (ctx) => {
    const seasons = await ctx.db.query("card_season").collect();
    seasons.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return Promise.all(seasons.map((doc) => seasonRecordToClient(ctx, doc)));
  }
});

export const totalCount = query({
  args: {},
  handler: async (ctx) => {
    let count = 0;
    for await (const _ of ctx.db.query("card_season")) {
      count += 1;
    }
    return count;
  }
});

// Server-only convenience helper
export const getDoc = query({
  args: {
    id: v.id("card_season")
  },
  handler: async (ctx, args) => ctx.db.get(args.id)
});

export async function upsertDefaultSeasons(ctx: Pick<MutationCtx, "db">, now = Date.now()) {
  for (const season of DEFAULT_SEASONS) {
    const existing = await ctx.db
      .query("card_season")
      .withIndex("byName", (q) => q.eq("seasonName", season.name))
      .first();

    if (existing) {
      const nextShort = season.shortName;
      const needsUpdate = existing.shortName !== nextShort;
      if (needsUpdate) {
        await ctx.db.patch(existing._id, {
          shortName: nextShort,
          updatedAt: now
        });
      }
      continue;
    }

    await ctx.db.insert("card_season", {
      seasonName: season.name,
      shortName: season.shortName,
      createdAt: now,
      updatedAt: now
    });
  }
}

export const ensureDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    await upsertDefaultSeasons(ctx, Date.now());
  }
});

async function seasonRecordToClient(ctx: QueryCtx, doc: SeasonDoc) {
  const id = docIdToString(doc._id);
  // Convex Cloud returns proper absolute URLs - no normalization needed
  const cardBackUrl = doc.cardBackStorageId ? await ctx.storage.getUrl(doc.cardBackStorageId) : null;

  return {
    id,
    season_name: doc.seasonName,
    short_name: doc.shortName ?? null,
    card_back: doc.cardBackName ?? null,
    card_back_storage_id: doc.cardBackStorageId ?? null,
    card_back_url: cardBackUrl,
    card_back_width: doc.cardBackWidth ?? null,
    card_back_height: doc.cardBackHeight ?? null,
    created: doc.createdAt,
    updated: doc.updatedAt
  } as const;
}
