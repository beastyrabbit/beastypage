import { internal } from "./_generated/api.js";
import { httpAction } from "./_generated/server.js";
import { isDiscordServiceRequest } from "./discordAuth.js";

export const userConfig = httpAction(async (ctx, request) => {
  if (!isDiscordServiceRequest(request))
    return new Response("Unauthorized", { status: 401 });
  try {
    const { operation, ...args } = await request.json();
    let result: unknown = null;
    switch (operation) {
      case "get":
        result = await ctx.runQuery(internal.discordUserConfig.get, args);
        break;
      case "upsert":
        await ctx.runMutation(internal.discordUserConfig.upsert, args);
        break;
      case "reset":
        await ctx.runMutation(internal.discordUserConfig.reset, args);
        break;
      case "addPalette":
        await ctx.runMutation(internal.discordUserConfig.addPalette, args);
        break;
      case "removePalette":
        await ctx.runMutation(internal.discordUserConfig.removePalette, args);
        break;
      default:
        return new Response("Unknown operation", { status: 400 });
    }
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch {
    return new Response("Invalid config request", { status: 400 });
  }
});
