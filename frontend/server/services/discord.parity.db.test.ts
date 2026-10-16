/// <reference types="vite/client" />
import { createHash } from "node:crypto";
import { convexTest } from "convex-test";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { closeDatabase, getDb } from "../db/client";
import type { Database } from "../db/pool";
import { discordChallenge } from "../db/schema";
import {
  getUserConfig,
  issueChallenge,
  redeemChallenge,
  updateUserConfig,
} from "./discord";

const modules = import.meta.glob("../../convex/**/*.ts");
let db: Database;

beforeAll(() => {
  process.env.DATABASE_URL = inject("databaseUrl");
  process.env.DISCORD_INVITE_SECRET = "https://discord.gg/parity";
  db = getDb();
});
afterAll(async () => {
  await closeDatabase();
  vi.unstubAllEnvs();
});

function answer(prompt: string) {
  const [left, right] = prompt.split("+").map((value) => Number(value.trim()));
  return String(left + right);
}

describe("Discord Convex/PostgreSQL parity", () => {
  it("covers config get/upsert, palette add/remove, reset and challenge redemption", async () => {
    const discordUserId = `parity-${crypto.randomUUID()}`;
    const convex = convexTest(schema, modules);
    expect(await getUserConfig(db, discordUserId)).toMatchObject(
      await convex.query(internal.discordUserConfigInternal.get, {
        discordUserId,
      }),
    );
    await updateUserConfig(db, "upsert", {
      discordUserId,
      accessoriesMin: 0,
      accessoriesMax: 4,
      scarsMin: 1,
      scarsMax: 3,
      tortiesMin: 2,
      tortiesMax: 4,
      darkForest: true,
      starclan: false,
    });
    await convex.mutation(internal.discordUserConfigInternal.upsert, {
      discordUserId,
      accessoriesMin: 0,
      accessoriesMax: 4,
      scarsMin: 1,
      scarsMax: 3,
      tortiesMin: 2,
      tortiesMax: 4,
      darkForest: true,
      starclan: false,
    });
    await updateUserConfig(db, "addPalette", {
      discordUserId,
      paletteId: "mood",
    });
    await updateUserConfig(db, "addPalette", {
      discordUserId,
      paletteId: "mood",
    });
    await convex.mutation(internal.discordUserConfigInternal.addPalette, {
      discordUserId,
      paletteId: "mood",
    });
    await convex.mutation(internal.discordUserConfigInternal.addPalette, {
      discordUserId,
      paletteId: "mood",
    });
    expect(await getUserConfig(db, discordUserId)).toMatchObject(
      await convex.query(internal.discordUserConfigInternal.get, {
        discordUserId,
      }),
    );
    await updateUserConfig(db, "removePalette", {
      discordUserId,
      paletteId: "mood",
    });
    await convex.mutation(internal.discordUserConfigInternal.removePalette, {
      discordUserId,
      paletteId: "mood",
    });
    await updateUserConfig(db, "reset", { discordUserId });
    await convex.mutation(internal.discordUserConfigInternal.reset, {
      discordUserId,
    });
    expect(await getUserConfig(db, discordUserId)).toMatchObject(
      await convex.query(internal.discordUserConfigInternal.get, {
        discordUserId,
      }),
    );

    const postgresChallenge = await issueChallenge(db);
    const convexChallenge = await convex.mutation(
      api.discord.issueChallenge,
      {},
    );
    expect(postgresChallenge.prompt).toMatch(/^\d+ \+ \d+$/);
    expect(convexChallenge.prompt).toMatch(/^\d+ \+ \d+$/);
    expect(
      await redeemChallenge(
        db,
        postgresChallenge.token,
        answer(postgresChallenge.prompt),
      ),
    ).toEqual({
      status: "success",
      inviteUrl: "https://discord.gg/parity",
    });
    expect(
      await convex.mutation(api.discord.redeemChallenge, {
        token: convexChallenge.token,
        answer: answer(convexChallenge.prompt),
      }),
    ).toEqual({
      status: "success",
      inviteUrl: "https://discord.gg/parity",
    });
  });

  it("matches malformed answers and expired challenge recovery", async () => {
    const convex = convexTest(schema, modules);
    const postgresChallenge = await issueChallenge(db);
    const convexChallenge = await convex.mutation(
      api.discord.issueChallenge,
      {},
    );
    await expect(
      redeemChallenge(db, postgresChallenge.token, "not-a-number"),
    ).resolves.toMatchObject({
      status: "retry",
      message: "Answers must be numbers. Here's a new challenge!",
    });
    await expect(
      convex.mutation(api.discord.redeemChallenge, {
        token: convexChallenge.token,
        answer: "not-a-number",
      }),
    ).resolves.toMatchObject({
      status: "retry",
      message: "Answers must be numbers. Here's a new challenge!",
    });

    const expiredToken = `expired-${crypto.randomUUID()}`;
    const salt = "expired-salt";
    const answerHash = createHash("sha256").update(`4:${salt}`).digest("hex");
    await db.insert(discordChallenge).values({
      token: expiredToken,
      salt,
      answerHash,
      expiresAt: new Date(Date.now() - 1),
    });
    const convexExpiredToken = `convex-${crypto.randomUUID()}`;
    await convex.run((ctx) =>
      ctx.db.insert("discord_challenge", {
        token: convexExpiredToken,
        salt,
        answerHash,
        expiresAt: Date.now() - 1,
        createdAt: Date.now() - 2,
      }),
    );
    await expect(redeemChallenge(db, expiredToken, "4")).resolves.toMatchObject(
      {
        status: "retry",
        message: "That challenge expired. Try again with a fresh puzzle!",
      },
    );
    await expect(
      convex.mutation(api.discord.redeemChallenge, {
        token: convexExpiredToken,
        answer: "4",
      }),
    ).resolves.toMatchObject({
      status: "retry",
      message: "That challenge expired. Try again with a fresh puzzle!",
    });
  });

  it("preserves the Convex field range accepted by the internal config API", async () => {
    const discordUserId = `limits-${crypto.randomUUID()}`;
    const convex = convexTest(schema, modules);
    const values = {
      discordUserId,
      accessoriesMin: -1,
      accessoriesMax: 99,
      scarsMin: 8,
      scarsMax: 9,
      tortiesMin: 100,
      tortiesMax: 101,
    };
    await updateUserConfig(db, "upsert", values);
    await convex.mutation(internal.discordUserConfigInternal.upsert, values);
    expect(await getUserConfig(db, discordUserId)).toMatchObject(
      await convex.query(internal.discordUserConfigInternal.get, {
        discordUserId,
      }),
    );
  });
});
