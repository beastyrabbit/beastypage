import type { Doc } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";

export async function requireHost(
  ctx: QueryCtx | MutationCtx,
  session: Doc<"stream_sessions">,
) {
  const identity = await ctx.auth.getUserIdentity();
  if (
    !session.ownerTokenIdentifier ||
    identity?.tokenIdentifier !== session.ownerTokenIdentifier
  ) {
    throw new Error("Only the session host may do this");
  }
}

export function listLimit(value: number) {
  return Number.isFinite(value)
    ? Math.max(1, Math.min(500, Math.floor(value)))
    : 50;
}
