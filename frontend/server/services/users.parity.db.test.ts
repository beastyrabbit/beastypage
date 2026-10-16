/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { ANONYMOUS } from "../auth/identity";
import { closeDatabase, getDb } from "../db/client";
import type { Database } from "../db/pool";
import { users } from "../db/schema";
import {
  findUserByApiKey,
  getOrCreateUser,
  regenerateApiKey,
  resetSavedVariants,
  resolveUsernames,
  searchByUsername,
  updateProfile,
  viewer,
} from "./users";
import { upsert as upsertVariant } from "./userVariants";

const modules = import.meta.glob("../../convex/**/*.ts");
let db: Database;

beforeAll(() => {
  process.env.DATABASE_URL = inject("databaseUrl");
  db = getDb();
});
afterAll(() => closeDatabase());

function identity(subject = crypto.randomUUID()) {
  return { tokenIdentifier: `https://parity.users|${subject}` };
}

async function markSearchReady(t: ReturnType<typeof convexTest>) {
  await t.run((ctx) =>
    ctx.db.insert("user_search_migrations", {
      name: "usernameSearch",
      complete: true,
      updatedAt: 1,
    }),
  );
}

describe("users Convex/PostgreSQL parity", () => {
  it("covers viewer, ensure, profile, search, resolve, key rotation and reset", async () => {
    const owner = identity();
    const convex = convexTest(schema, modules);
    const convexOwner = convex.withIdentity(owner);
    const postgresCreated = await getOrCreateUser(db, owner);
    await convexOwner.mutation(api.users.getOrCreateUser, {});
    expect((await viewer(db, owner))?.tokenIdentifier).toBe(
      owner.tokenIdentifier,
    );
    expect(
      (await convexOwner.query(api.users.viewer, {}))?.tokenIdentifier,
    ).toBe(owner.tokenIdentifier);

    await markSearchReady(convex);
    await updateProfile(db, owner, "Parity_User");
    await convexOwner.mutation(api.users.updateProfile, {
      username: "Parity_User",
    });
    expect(await searchByUsername(db, owner, "PARITY")).toEqual([
      {
        userId: owner.tokenIdentifier.split("|").at(-1),
        username: "Parity_User",
      },
    ]);
    expect(
      await convexOwner.query(api.users.searchByUsername, { prefix: "PARITY" }),
    ).toEqual([
      {
        userId: owner.tokenIdentifier.split("|").at(-1),
        username: "Parity_User",
      },
    ]);

    const resolved = identity("resolved");
    await getOrCreateUser(db, resolved);
    await convex.withIdentity(resolved).mutation(api.users.getOrCreateUser, {});
    await updateProfile(db, resolved, "Resolved_User");
    await convex
      .withIdentity(resolved)
      .mutation(api.users.updateProfile, { username: "Resolved_User" });
    expect(await resolveUsernames(db, owner, ["resolved", "missing"])).toEqual([
      { userId: "resolved", username: "Resolved_User" },
      { userId: "missing", username: "missing" },
    ]);
    expect(
      await convexOwner.query(api.users.resolveUsernames, {
        userIds: ["resolved", "missing"],
      }),
    ).toEqual([
      { userId: "resolved", username: "Resolved_User" },
      { userId: "missing", username: "missing" },
    ]);

    const oldKey = postgresCreated.apiKey as string;
    const convexOldKey = (await convexOwner.query(api.users.viewer, {}))
      ?.apiKey as string;
    expect((await findUserByApiKey(db, oldKey))?.tokenIdentifier).toBe(
      owner.tokenIdentifier,
    );
    expect(await findUserByApiKey(db, `${oldKey}wrong`)).toBeNull();
    expect(
      (
        await convexOwner.query(internal.users.getUserByApiKey, {
          apiKey: convexOldKey,
        })
      )?.tokenIdentifier,
    ).toBe(owner.tokenIdentifier);
    expect(
      await convexOwner.query(internal.users.getUserByApiKey, {
        apiKey: `${convexOldKey}wrong`,
      }),
    ).toBeNull();
    const rotated = await regenerateApiKey(db, owner);
    const convexRotated = await convexOwner.mutation(
      api.users.regenerateApiKey,
      {},
    );
    expect(rotated).not.toBe(oldKey);
    expect(rotated).toMatch(/^[0-9a-f-]{36}$/);
    expect(convexRotated).toMatch(/^[0-9a-f-]{36}$/);

    await upsertVariant(db, owner, {
      toolKey: "dash",
      variantId: "reset",
      name: "Reset",
      settings: {},
      isActive: false,
    });
    await convexOwner.mutation(api.userVariants.upsert, {
      toolKey: "dash",
      variantId: "reset",
      name: "Reset",
      settings: {},
      isActive: false,
    });
    expect(await resetSavedVariants(db, owner)).toEqual({ remaining: false });
    expect(
      await convexOwner.mutation(api.users.resetSavedVariants, {}),
    ).toEqual({ remaining: false });
  });

  it("matches anonymous and other-user authorization failures", async () => {
    const owner = identity();
    const other = identity();
    const convex = convexTest(schema, modules);
    const convexOwner = convex.withIdentity(owner);
    const convexOther = convex.withIdentity(other);
    await getOrCreateUser(db, owner);
    await getOrCreateUser(db, other);
    await convexOwner.mutation(api.users.getOrCreateUser, {});
    await convexOther.mutation(api.users.getOrCreateUser, {});
    await updateProfile(db, owner, "Owned_User");
    await convexOwner.mutation(api.users.updateProfile, {
      username: "Owned_User",
    });

    await expect(
      updateProfile(db, ANONYMOUS, "Anonymous"),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      convexTest(schema, modules).mutation(api.users.updateProfile, {
        username: "Anonymous",
      }),
    ).rejects.toThrow("Not authenticated");
    await expect(updateProfile(db, other, "Owned_User")).rejects.toMatchObject({
      code: "conflict",
    });
    await expect(
      convexOther.mutation(api.users.updateProfile, { username: "Owned_User" }),
    ).rejects.toThrow("already taken");
    expect(await findUserByApiKey(db, "wrong-api-key")).toBeNull();
  });

  it("derives sanitized unique usernames and compares username claims exactly", async () => {
    const profileLoader = async () => ({
      username: "--Mira Example__",
      firstName: "Fallback",
      lastName: "Name",
      primaryEmail: "mira@example.test",
    });
    const claimed = identity();
    const first = await getOrCreateUser(db, claimed, profileLoader);
    expect(first.username).toBe("MiraExample");
    const collision = await getOrCreateUser(db, identity(), async () => ({
      username: "Mira Example",
    }));
    expect(collision.username).toMatch(/^MiraExample-[a-f0-9]{4}$/);

    const exactA = identity();
    const exactB = identity();
    await getOrCreateUser(db, exactA);
    await getOrCreateUser(db, exactB);
    await updateProfile(db, exactA, "CaseSensitive");
    await expect(
      updateProfile(db, exactB, "casesensitive"),
    ).resolves.toMatchObject({
      username: "casesensitive",
    });
    const [exactARow] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.tokenIdentifier, exactA.tokenIdentifier));
    if (!exactARow) throw new Error("missing exact-case fixture");
    await db
      .update(users)
      .set({ updatedAt: new Date(0) })
      .where(eq(users.id, exactARow.id));
    const touched = await updateProfile(db, exactA);
    expect(touched.updatedAt).toBeGreaterThan(0);
  });

  it("keeps username and resolve validation limits aligned", async () => {
    const owner = identity();
    const convex = convexTest(schema, modules).withIdentity(owner);
    await getOrCreateUser(db, owner);
    await convex.mutation(api.users.getOrCreateUser, {});
    for (const username of ["x".repeat(31), "has space"]) {
      await expect(updateProfile(db, owner, username)).rejects.toMatchObject({
        code: "invalid_input",
      });
      await expect(
        convex.mutation(api.users.updateProfile, { username }),
      ).rejects.toThrow();
    }
    const ids = Array.from({ length: 101 }, (_, index) => `user_${index}`);
    await expect(resolveUsernames(db, owner, ids)).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(
      convex.query(api.users.resolveUsernames, { userIds: ids }),
    ).rejects.toThrow("at most 100");
  });
});
