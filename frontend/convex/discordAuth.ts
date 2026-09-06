/** Only the bot service may assert the user from a verified Discord interaction. */
export function isDiscordServiceRequest(request: Request): boolean {
  const token = process.env.DISCORD_API_TOKEN;
  if (!token || token.length < 32) return false;
  const actual = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${token}`;
  let difference = actual.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) {
    difference |= expected.charCodeAt(i) ^ (actual.charCodeAt(i) || 0);
  }
  return difference === 0;
}
