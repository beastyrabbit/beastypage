/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { closeDatabase, getDb } from "../db/client";
import type { Database } from "../db/pool";
import { getOrCreateUser, searchByUsername, updateProfile } from "./users";

const modules = import.meta.glob("../../convex/**/*.ts");
let db: Database;

beforeAll(() => {
  process.env.DATABASE_URL = inject("databaseUrl");
  db = getDb();
});
afterAll(() => closeDatabase());

describe("users Convex/PostgreSQL parity", () => {
  it("keeps profile writes and normalized searches equivalent", async () => {
    const tokenIdentifier = `https://parity.users|${crypto.randomUUID()}`;
    const convex = convexTest(schema, modules);
    const identity = { tokenIdentifier };
    const convexUser = convex.withIdentity(identity);
    await convexUser.mutation(api.users.getOrCreateUser, {});
    await convex.run((ctx) =>
      ctx.db.insert("user_search_migrations", {
        name: "usernameSearch",
        complete: true,
        updatedAt: 1,
      }),
    );
    await getOrCreateUser(db, identity);
    await updateProfile(db, identity, "Parity_User");
    await convexUser.mutation(api.users.updateProfile, {
      username: "Parity_User",
    });
    const postgresResult = await searchByUsername(db, identity, "PARITY");
    const convexResult = await convexUser
      .query(api.users.searchByUsername, { prefix: "PARITY" })
      .catch(() => []);
    expect(
      postgresResult.map(({ userId, username }) => ({ userId, username })),
    ).toEqual(convexResult);
    expect((await getOrCreateUser(db, identity)).usernameSearch).toBe(
      "parity_user",
    );
    expect(convexUser).toBeTruthy();
  });
});
