import "server-only";

import type { internal } from "@/convex/_generated/api";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { getUserConfig, updateUserConfig } from "@/server/services/discord";

export type DiscordUserConfig =
  typeof internal.discordUserConfigInternal.get._returnType;

export async function discordConfig(
  operation: string,
  args: Record<string, unknown>,
): Promise<DiscordUserConfig> {
  if (dataBackend() === "postgres") {
    if (operation === "get" && typeof args.discordUserId === "string")
      return getUserConfig(
        getDb(),
        args.discordUserId,
      ) as Promise<DiscordUserConfig>;
    await updateUserConfig(getDb(), operation, args);
    return (
      typeof args.discordUserId === "string"
        ? getUserConfig(getDb(), args.discordUserId)
        : null
    ) as Promise<DiscordUserConfig>;
  }
  const site =
    process.env.CONVEX_SITE_URL ?? process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  const token = process.env.DISCORD_API_TOKEN;
  if (!site || !token) throw new Error("Discord service is not configured");
  const response = await fetch(new URL("/discord/user-config", site), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ operation, ...args }),
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Discord config request failed");
  return response.json();
}
