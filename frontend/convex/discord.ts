import { v } from "convex/values";

import { mutation } from "./_generated/server.js";
import type { MutationCtx } from "./_generated/server.js";

const CHALLENGE_EXPIRY_MS = 5 * 60 * 1000;

const rawInviteSecret = (process.env.DISCORD_INVITE_SECRET ?? "").trim();

const INVITE_URL =
  rawInviteSecret.length === 0
    ? null
    : rawInviteSecret.includes("://")
      ? rawInviteSecret
      : `https://discord.gg/${rawInviteSecret}`;

function randomIntInclusive(min: number, max: number) {
  if (max <= min) {
    return min;
  }
  const range = max - min + 1;
  if (globalThis.crypto?.getRandomValues) {
    const buffer = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buffer);
    return min + (buffer[0] % range);
  }
  return min + Math.floor(Math.random() * range);
}

function randomHex(bytes: number) {
  if (bytes <= 0) {
    return "";
  }
  if (globalThis.crypto?.getRandomValues) {
    const buffer = new Uint8Array(bytes);
    globalThis.crypto.getRandomValues(buffer);
    return Array.from(buffer, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  let output = "";
  for (let i = 0; i < bytes; i += 1) {
    output += Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0");
  }
  return output;
}

async function hashAnswer(answer: string, salt: string) {
  const payload = `${answer}:${salt}`;
  if (globalThis.crypto?.subtle) {
    const encoded = new TextEncoder().encode(payload);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }
  let hash = 0;
  for (let i = 0; i < payload.length; i += 1) {
    hash = (hash << 5) - hash + payload.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(16);
}

interface ChallengeOptions {
  avoidAnswer?: number;
}

async function pruneExpiredChallenges(ctx: MutationCtx, now: number) {
  for await (const challenge of ctx.db.query("discord_challenge")) {
    if (challenge.expiresAt <= now || challenge.usedAt) {
      await ctx.db.delete(challenge._id);
    }
  }
}

async function createChallenge(ctx: MutationCtx, options: ChallengeOptions = {}) {
  const now = Date.now();
  let left = randomIntInclusive(2, 10);
  let right = randomIntInclusive(2, 10);
  let answer = left + right;

  if (typeof options.avoidAnswer === "number") {
    while (answer === options.avoidAnswer) {
      left = randomIntInclusive(2, 10);
      right = randomIntInclusive(2, 10);
      answer = left + right;
    }
  }

  const answerStr = answer.toString();
  const token = randomHex(16);
  const salt = randomHex(16);

  await ctx.db.insert("discord_challenge", {
    token,
    answerHash: await hashAnswer(answerStr, salt),
    salt,
    expiresAt: now + CHALLENGE_EXPIRY_MS,
    createdAt: now
  });

  return {
    token,
    prompt: `${left} + ${right}`,
    expiresAt: now + CHALLENGE_EXPIRY_MS
  } as const;
}

export const issueChallenge = mutation({
  args: {},
  handler: async (ctx) => {
    await pruneExpiredChallenges(ctx, Date.now());
    return createChallenge(ctx);
  }
});

export const redeemChallenge = mutation({
  args: {
    token: v.string(),
    answer: v.string()
  },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("discord_challenge")
      .withIndex("byToken", (q) => q.eq("token", args.token))
      .first();

    if (!record) {
      await pruneExpiredChallenges(ctx, Date.now());
      const freshChallenge = await createChallenge(ctx);
      return {
        status: "retry",
        message: "That challenge timed out. Try this new one!",
        challenge: freshChallenge
      } as const;
    }

    const now = Date.now();
    if (record.expiresAt <= now) {
      await ctx.db.delete(record._id);
      const freshChallenge = await createChallenge(ctx);
      return {
        status: "retry",
        message: "That challenge expired. Try again with a fresh puzzle!",
        challenge: freshChallenge
      } as const;
    }

    if (!INVITE_URL) {
      return {
        status: "error",
        message: "Discord invite isn't configured yet. Please try again later."
      } as const;
    }

    const cleanedAnswer = args.answer.trim();
    const answerNumber = Number.parseInt(cleanedAnswer, 10);

    if (!cleanedAnswer || !/^\d+$/.test(cleanedAnswer) || Number.isNaN(answerNumber)) {
      await ctx.db.delete(record._id);
      const freshChallenge = await createChallenge(ctx);
      return {
        status: "retry",
        message: "Answers must be numbers. Here's a new challenge!",
        challenge: freshChallenge
      } as const;
    }

    const answerHash = await hashAnswer(cleanedAnswer, record.salt);
    if (answerHash !== record.answerHash) {
      await ctx.db.delete(record._id);
      const freshChallenge = await createChallenge(ctx, { avoidAnswer: answerNumber });
      return {
        status: "retry",
        message: "Not quite! Try this new puzzle.",
        challenge: freshChallenge
      } as const;
    }

    await ctx.db.delete(record._id);

    return {
      status: "success",
      inviteUrl: INVITE_URL
    } as const;
  }
});
