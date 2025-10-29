import { internalMutation } from "./_generated/server.js";
import { upsertDefaultRarities } from "./rarities.js";
import { upsertDefaultSeasons } from "./seasons.js";

export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    await upsertDefaultRarities(ctx, now);

    await upsertDefaultSeasons(ctx, now);
  }
});
