/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { closeDatabase, getDb } from "../db/client";
import type { Database } from "../db/pool";
import { getOrCreateUser } from "./users";
import { list, remove, upsert } from "./userVariants";

const modules = import.meta.glob("../../convex/**/*.ts");
let db: Database;

beforeAll(() => {
  process.env.DATABASE_URL = inject("databaseUrl");
  db = getDb();
});
afterAll(() => closeDatabase());

describe("user variants Convex/PostgreSQL parity", () => {
  it("keeps active variant selection and removal equivalent", async () => {
    const tokenIdentifier = `https://parity.variants|${crypto.randomUUID()}`;
    const identity = { tokenIdentifier };
    const convexUser = convexTest(schema, modules).withIdentity(identity);
    await convexUser.mutation(api.users.getOrCreateUser, {});
    await getOrCreateUser(db, identity);
    const args = {
      toolKey: "dash",
      variantId: "parity",
      name: "Parity",
      settings: {},
      isActive: true,
    };
    await convexUser.mutation(api.userVariants.upsert, args);
    await upsert(db, identity, args);
    expect(
      (await list(db, identity, "dash")).map((row) => row.variantId),
    ).toEqual(
      (await convexUser.query(api.userVariants.list, { toolKey: "dash" })).map(
        (row) => row.variantId,
      ),
    );
    await remove(db, identity, "dash", "parity");
    await convexUser.mutation(api.userVariants.remove, {
      toolKey: "dash",
      variantId: "parity",
    });
    expect(await list(db, identity, "dash")).toEqual([]);
  });
});
