import { mutation, query } from "./_generated/server.js";
import {
  getSettings,
  saveSettings,
  settingsArgs,
  settingsSlugArgs,
} from "./settings.js";

export const save = mutation({
  args: settingsArgs,
  handler: (ctx, args) => saveSettings(ctx, "dash_settings", args),
});

export const get = query({
  args: settingsSlugArgs,
  handler: (ctx, args) => getSettings(ctx, "dash_settings", args.slug),
});
