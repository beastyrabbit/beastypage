import { mutation, query } from "./_generated/server.js";
import {
  getSettings,
  saveSettings,
  settingsArgs,
  settingsSlugArgs,
} from "./settings.js";

export const save = mutation({
  args: settingsArgs,
  handler: (ctx, args) => saveSettings(ctx, "single_cat_settings", args),
});

export const get = query({
  args: settingsSlugArgs,
  handler: (ctx, args) => getSettings(ctx, "single_cat_settings", args.slug),
});
