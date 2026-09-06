import type { Id } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";

/** Bridge-only guard: legacy APIs cannot read or mutate modern voting sessions. */
export async function assertLegacySession(
  ctx: QueryCtx | MutationCtx,
  id: Id<"stream_sessions">,
) {
  const session = await ctx.db.get(id);
  if (
    !session ||
    session.ownerTokenIdentifier ||
    session.allowedOptions !== undefined
  ) {
    throw new Error("Reload to use this session");
  }
  return session;
}
