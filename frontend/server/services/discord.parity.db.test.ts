/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { closeDatabase, getDb } from "../db/client";
import type { Database } from "../db/pool";
import { getUserConfig, updateUserConfig } from "./discord";

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

describe("Discord Convex/PostgreSQL parity", () => {
  it("keeps config defaults and updates equivalent", async () => {
    const discordUserId = `parity-${crypto.randomUUID()}`;
    const convex = convexTest(schema, modules);
    const before = await convex.query(internal.discordUserConfigInternal.get, {
      discordUserId,
    });
    const postgresBefore = await getUserConfig(db, discordUserId);
    expect(postgresBefore).toMatchObject(before);
    await convex.mutation(internal.discordUserConfigInternal.upsert, {
      discordUserId,
      darkForest: true,
    });
    await updateUserConfig(db, "upsert", { discordUserId, darkForest: true });
    expect(await getUserConfig(db, discordUserId)).toMatchObject(
      await convex.query(internal.discordUserConfigInternal.get, {
        discordUserId,
      }),
    );
    await expect(
      convex.mutation(api.discord.issueChallenge, {}),
    ).resolves.toMatchObject({ prompt: expect.any(String) });
  });
});
