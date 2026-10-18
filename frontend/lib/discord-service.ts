import "server-only";

import { getDb } from "@/server/db/client";
import { getUserConfig, updateUserConfig } from "@/server/services/discord";

export type DiscordUserConfig = Awaited<ReturnType<typeof getUserConfig>>;

export function isDiscordServiceRequest(request: Request): boolean {
  const token = process.env.DISCORD_API_TOKEN;
  if (!token || token.length < 32) return false;
  const actual = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${token}`;
  let difference = actual.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) {
    difference |= (expected.codePointAt(i) ?? 0) ^ (actual.codePointAt(i) ?? 0);
  }
  return difference === 0;
}

export async function discordConfig(
  operation: string,
  args: Record<string, unknown>,
): Promise<DiscordUserConfig | null> {
  if (operation === "get" && typeof args.discordUserId === "string") {
    return getUserConfig(getDb(), args.discordUserId);
  }
  await updateUserConfig(getDb(), operation, args);
  return typeof args.discordUserId === "string"
    ? getUserConfig(getDb(), args.discordUserId)
    : null;
}
