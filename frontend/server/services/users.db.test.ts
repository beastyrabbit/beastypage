import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { closeDatabase, getDb } from "@/server/db/client";
import type { Database } from "@/server/db/pool";
import {
  findUserByApiKey,
  getOrCreateUser,
  searchByUsername,
  updateProfile,
} from "./users";

const env = { ...process.env };
let db: Database;
const identity = {
  tokenIdentifier: `https://users.test|${crypto.randomUUID()}`,
};

beforeAll(() => {
  process.env.DATABASE_URL = inject("databaseUrl");
  db = getDb();
});
afterAll(async () => {
  await closeDatabase();
  process.env = env;
});

describe("users PostgreSQL service", () => {
  it("ensures a user, keeps username search current, and rotates keys", async () => {
    const created = await getOrCreateUser(db, identity);
    expect(created.apiKey).toBeTruthy();
    await expect(
      updateProfile(db, identity, "Casey_User"),
    ).resolves.toMatchObject({
      username: "Casey_User",
      usernameSearch: "casey_user",
    });
    await expect(searchByUsername(db, identity, "CASEY")).resolves.toEqual([
      {
        userId: identity.tokenIdentifier.split("|").at(-1),
        username: "Casey_User",
      },
    ]);
    const found = await findUserByApiKey(db, created.apiKey as string);
    expect(found?.tokenIdentifier).toBe(identity.tokenIdentifier);
  });

  it("rejects invalid and duplicate usernames", async () => {
    await expect(updateProfile(db, identity, "bad name")).rejects.toMatchObject(
      { code: "invalid_input" },
    );
    const other = {
      tokenIdentifier: `https://users.test|${crypto.randomUUID()}`,
    };
    await getOrCreateUser(db, other);
    await expect(updateProfile(db, other, "Casey_User")).rejects.toMatchObject({
      code: "conflict",
    });
  });
});
