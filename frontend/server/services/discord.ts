import "server-only";

import { createHash, randomBytes, randomInt } from "node:crypto";
import type { Database } from "../db/pool";
import { withTransaction } from "../db/transaction";
import type { DiscordUserConfigRow } from "../repositories/discord";
import {
  deleteChallenge,
  deleteUserConfig,
  getChallenge,
  getUserConfig as getUserConfigRow,
  insertChallenge as insertChallengeRow,
  insertUserConfig,
  pruneExpiredChallenges,
  updateUserConfig as updateUserConfigRow,
} from "../repositories/discord";

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

async function insertChallenge(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
) {
  const left = randomInt(2, 11);
  const right = randomInt(2, 11);
  const token = randomBytes(16).toString("hex");
  const salt = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + CHALLENGE_EXPIRY_MS);
  await insertChallengeRow(tx, {
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
    await pruneExpiredChallenges(tx, new Date());
    return insertChallenge(tx);
  });
}

export async function redeemChallenge(
  db: Database,
  token: string,
  answer: string,
) {
  return withTransaction(db, async (tx) => {
    const record = await getChallenge(tx, token);
    const fresh = async (message: string) => ({
      status: "retry" as const,
      message,
      challenge: await insertChallenge(tx),
    });
    if (!record) return fresh("That challenge timed out. Try this new one!");
    if (record.expiresAt.getTime() <= Date.now()) {
      await deleteChallenge(tx, record.id);
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
      await deleteChallenge(tx, record.id);
      return fresh("Answers must be numbers. Here's a new challenge!");
    }
    if (hashAnswer(cleaned, record.salt) !== record.answerHash) {
      await deleteChallenge(tx, record.id);
      return fresh("Not quite! Try this new puzzle.");
    }
    await deleteChallenge(tx, record.id);
    return {
      status: "success" as const,
      inviteUrl: invite.includes("://")
        ? invite
        : `https://discord.gg/${invite}`,
    };
  });
}

function toConfig(row: DiscordUserConfigRow, discordUserId: string) {
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
    const row = await getUserConfigRow(tx, discordUserId);
    return row ? toConfig(row, discordUserId) : { ...DEFAULTS, discordUserId };
  });
}

export async function updateUserConfig(
  // NOSONAR
  db: Database,
  operation: string,
  args: Record<string, unknown>,
) {
  return withTransaction(db, async (tx) => {
    const discordUserId =
      typeof args.discordUserId === "string" ? args.discordUserId : "";
    if (!discordUserId) throw new Error("Invalid config request");
    const existing = await getUserConfigRow(tx, discordUserId);
    if (operation === "reset") {
      if (existing) await deleteUserConfig(tx, existing.id);
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
        await updateUserConfigRow(tx, existing.id, { palettes: next });
      else
        await insertUserConfig(tx, {
          discordUserId,
          ...DEFAULTS,
          palettes: next,
        });
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
    if (existing) await updateUserConfigRow(tx, existing.id, fields);
    else {
      const values = { discordUserId, ...DEFAULTS };
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined)
          (values as Record<string, unknown>)[key] = value;
      }
      await insertUserConfig(tx, values);
    }
    return null;
  });
}
