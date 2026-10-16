import "server-only";

import { createHash, randomBytes, randomInt } from "node:crypto";
import { eq, lte, sql } from "drizzle-orm";
import type { Database } from "../db/pool";
import { discordChallenge, discordUserConfigs } from "../db/schema";
import { withTransaction } from "../db/transaction";

const CHALLENGE_EXPIRY_MS = 5 * 60 * 1000;
const DEFAULTS = {
  accessoriesMin: 0,
  accessoriesMax: 4,
  scarsMin: 0,
  scarsMax: 4,
  tortiesMin: 0,
  tortiesMax: 4,
  darkForest: false,
  starclan: false,
  palettes: [] as string[],
};

export const discordDefaults = DEFAULTS;

function hashAnswer(answer: string, salt: string) {
  return createHash("sha256").update(`${answer}:${salt}`).digest("hex");
}

async function prune(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
) {
  await tx
    .delete(discordChallenge)
    .where(lte(discordChallenge.expiresAt, new Date()));
}

async function insertChallenge(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
) {
  const left = randomInt(2, 11);
  const right = randomInt(2, 11);
  const token = randomBytes(16).toString("hex");
  const salt = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + CHALLENGE_EXPIRY_MS);
  await tx.insert(discordChallenge).values({
    token,
    salt,
    answerHash: hashAnswer(String(left + right), salt),
    expiresAt,
  });
  return {
    token,
    prompt: `${left} + ${right}`,
    expiresAt: expiresAt.getTime(),
  };
}

export async function issueChallenge(db: Database) {
  return withTransaction(db, async (tx) => {
    await prune(tx);
    return insertChallenge(tx);
  });
}

export async function redeemChallenge(
  db: Database,
  token: string,
  answer: string,
) {
  return withTransaction(db, async (tx) => {
    const [record] = await tx
      .select()
      .from(discordChallenge)
      .where(eq(discordChallenge.token, token))
      .limit(1);
    const fresh = async (message: string) => ({
      status: "retry" as const,
      message,
      challenge: await insertChallenge(tx),
    });
    if (!record) return fresh("That challenge timed out. Try this new one!");
    if (record.expiresAt.getTime() <= Date.now()) {
      await tx
        .delete(discordChallenge)
        .where(eq(discordChallenge.id, record.id));
      return fresh("That challenge expired. Try again with a fresh puzzle!");
    }
    const invite = (process.env.DISCORD_INVITE_SECRET ?? "").trim();
    if (!invite)
      return {
        status: "error" as const,
        message: "Discord invite isn't configured yet. Please try again later.",
      };
    const cleaned = answer.trim();
    if (!/^\d+$/.test(cleaned)) {
      await tx
        .delete(discordChallenge)
        .where(eq(discordChallenge.id, record.id));
      return fresh("Answers must be numbers. Here's a new challenge!");
    }
    if (hashAnswer(cleaned, record.salt) !== record.answerHash) {
      await tx
        .delete(discordChallenge)
        .where(eq(discordChallenge.id, record.id));
      return fresh("Not quite! Try this new puzzle.");
    }
    await tx.delete(discordChallenge).where(eq(discordChallenge.id, record.id));
    return {
      status: "success" as const,
      inviteUrl: invite.includes("://")
        ? invite
        : `https://discord.gg/${invite}`,
    };
  });
}

function toConfig(
  row: typeof discordUserConfigs.$inferSelect,
  discordUserId: string,
) {
  return {
    discordUserId,
    accessoriesMin: row.accessoriesMin,
    accessoriesMax: row.accessoriesMax,
    scarsMin: row.scarsMin,
    scarsMax: row.scarsMax,
    tortiesMin: row.tortiesMin,
    tortiesMax: row.tortiesMax,
    darkForest: row.darkForest,
    starclan: row.starclan,
    palettes: row.palettes,
  };
}

export async function getUserConfig(db: Database, discordUserId: string) {
  return withTransaction(db, async (tx) => {
    const [row] = await tx
      .select()
      .from(discordUserConfigs)
      .where(eq(discordUserConfigs.discordUserId, discordUserId))
      .limit(1);
    return row ? toConfig(row, discordUserId) : { ...DEFAULTS, discordUserId };
  });
}

export async function updateUserConfig(
  db: Database,
  operation: string,
  args: Record<string, unknown>,
) {
  return withTransaction(db, async (tx) => {
    const discordUserId =
      typeof args.discordUserId === "string" ? args.discordUserId : "";
    if (!discordUserId) throw new Error("Invalid config request");
    const [existing] = await tx
      .select()
      .from(discordUserConfigs)
      .where(eq(discordUserConfigs.discordUserId, discordUserId))
      .limit(1);
    if (operation === "reset") {
      if (existing)
        await tx
          .delete(discordUserConfigs)
          .where(eq(discordUserConfigs.id, existing.id));
      return null;
    }
    if (operation === "addPalette" || operation === "removePalette") {
      const paletteId =
        typeof args.paletteId === "string" ? args.paletteId : "";
      const palettes = existing?.palettes ?? [];
      const next =
        operation === "addPalette"
          ? [...new Set([...palettes, paletteId])]
          : palettes.filter((value) => value !== paletteId);
      if (existing)
        await tx
          .update(discordUserConfigs)
          .set({ palettes: next, updatedAt: sql`now()` })
          .where(eq(discordUserConfigs.id, existing.id));
      else
        await tx
          .insert(discordUserConfigs)
          .values({ discordUserId, ...DEFAULTS, palettes: next });
      return null;
    }
    const fields = {
      accessoriesMin:
        typeof args.accessoriesMin === "number"
          ? args.accessoriesMin
          : undefined,
      accessoriesMax:
        typeof args.accessoriesMax === "number"
          ? args.accessoriesMax
          : undefined,
      scarsMin: typeof args.scarsMin === "number" ? args.scarsMin : undefined,
      scarsMax: typeof args.scarsMax === "number" ? args.scarsMax : undefined,
      tortiesMin:
        typeof args.tortiesMin === "number" ? args.tortiesMin : undefined,
      tortiesMax:
        typeof args.tortiesMax === "number" ? args.tortiesMax : undefined,
      darkForest:
        typeof args.darkForest === "boolean" ? args.darkForest : undefined,
      starclan: typeof args.starclan === "boolean" ? args.starclan : undefined,
    };
    if (existing)
      await tx
        .update(discordUserConfigs)
        .set({ ...fields, updatedAt: sql`now()` })
        .where(eq(discordUserConfigs.id, existing.id));
    else {
      const values = { discordUserId, ...DEFAULTS };
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined)
          (values as Record<string, unknown>)[key] = value;
      }
      await tx.insert(discordUserConfigs).values(values);
    }
    return null;
  });
}
