import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { closeDatabase, getDb } from "@/server/db/client";
import type { Database } from "@/server/db/pool";
import { users } from "@/server/db/schema";
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

  it("serializes concurrent first sign-ins without locking existing users", async () => {
    const concurrentIdentity = {
      tokenIdentifier: `https://users.test|${crypto.randomUUID()}`,
    };
    const profileLoader = async () => ({ username: "Concurrent_User" });
    const [first, second] = await Promise.all([
      getOrCreateUser(db, concurrentIdentity, profileLoader),
      getOrCreateUser(db, concurrentIdentity, profileLoader),
    ]);
    expect(first._id).toBe(second._id);
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.tokenIdentifier, concurrentIdentity.tokenIdentifier));
    expect(rows).toHaveLength(1);

    let releaseLock!: () => void;
    const lockRelease = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    let lockReady!: () => void;
    const lockReadyPromise = new Promise<void>((resolve) => {
      lockReady = resolve;
    });
    const tokenLockKey = `beastypage:users:ensure:${concurrentIdentity.tokenIdentifier}`;
    const heldLock = db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${tokenLockKey}, 0))`,
      );
      lockReady();
      await lockRelease;
    });
    await lockReadyPromise;
    const ensured = await Promise.race([
      getOrCreateUser(db, concurrentIdentity, async () => {
        throw new Error("profile loader must not run for an existing user");
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("existing ensure blocked")), 200),
      ),
    ]);
    expect(ensured._id).toBe(first._id);
    releaseLock();
    await heldLock;

    const profileFailureIdentity = {
      tokenIdentifier: `https://users.test|${crypto.randomUUID()}`,
    };
    await expect(
      getOrCreateUser(db, profileFailureIdentity, async () => {
        throw new Error("Clerk unavailable");
      }),
    ).resolves.toMatchObject({ username: undefined });
  });
});
