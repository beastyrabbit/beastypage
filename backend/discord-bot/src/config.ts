function requiredEnv(name: string, defaultValue?: string): string {
  const value = process.env[name] ?? defaultValue;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  discordBotToken: requiredEnv("DISCORD_BOT_TOKEN"),
  discordClientId: requiredEnv("DISCORD_CLIENT_ID", "1470478917776441416"),
  discordGuildId: process.env.DISCORD_GUILD_ID || undefined,
  frontendApiUrl: requiredEnv("FRONTEND_API_URL"),
} as const;
