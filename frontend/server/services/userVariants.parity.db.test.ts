/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { ANONYMOUS } from "../auth/identity";
import { closeDatabase, getDb } from "../db/client";
import type { Database } from "../db/pool";
import { getOrCreateUser } from "./users";
import {
  importBatch,
  list,
  remove,
  rename,
  setActive,
  upsert,
} from "./userVariants";

const modules = import.meta.glob("../../convex/**/*.ts");
let db: Database;

beforeAll(() => {
  process.env.DATABASE_URL = inject("databaseUrl");
  db = getDb();
});
afterAll(() => closeDatabase());

function identity(subject = crypto.randomUUID()) {
  return { tokenIdentifier: `https://parity.variants|${subject}` };
}

const variant = (variantId: string, isActive = false) => ({
  toolKey: "dash",
  variantId,
  name: `Variant ${variantId}`,
  settings: { v: 1, widgets: [] },
  isActive,
});

describe("user variants Convex/PostgreSQL parity", () => {
  it("covers list/listAll, upsert, rename, setActive, import and remove", async () => {
    const owner = identity();
    const convex = convexTest(schema, modules);
    const convexOwner = convex.withIdentity(owner);
    await getOrCreateUser(db, owner);
    await convexOwner.mutation(api.users.getOrCreateUser, {});

    await upsert(db, owner, variant("one", true));
    await convexOwner.mutation(api.userVariants.upsert, variant("one", true));
    await upsert(db, owner, variant("two"));
    await convexOwner.mutation(api.userVariants.upsert, variant("two"));
    expect((await list(db, owner, "dash")).map((row) => row.variantId)).toEqual(
      (await convexOwner.query(api.userVariants.list, { toolKey: "dash" })).map(
        (row) => row.variantId,
      ),
    );

    await rename(db, owner, "dash", "two", "Renamed");
    await convexOwner.mutation(api.userVariants.rename, {
      toolKey: "dash",
      variantId: "two",
      name: "Renamed",
    });
    await setActive(db, owner, "dash", "two");
    await convexOwner.mutation(api.userVariants.setActive, {
      toolKey: "dash",
      variantId: "two",
    });
    expect(
      (await list(db, owner, "dash"))
        .filter((row) => row.isActive)
        .map((row) => row.variantId),
    ).toEqual(
      (await convexOwner.query(api.userVariants.list, { toolKey: "dash" }))
        .filter((row) => row.isActive)
        .map((row) => row.variantId),
    );

    const batch = [
      {
        variantId: "three",
        name: "Variant three",
        settings: { v: 1, widgets: [] },
        isActive: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        variantId: "four",
        name: "Variant four",
        settings: { v: 1, widgets: [] },
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
    expect(await importBatch(db, owner, "dash", batch)).toEqual({
      imported: 2,
      total: 2,
    });
    expect(
      await convexOwner.mutation(api.userVariants.importBatch, {
        toolKey: "dash",
        variants: batch,
      }),
    ).toMatchObject({ imported: 2, total: 2 });
    expect((await list(db, owner)).length).toBe(
      (await convexOwner.query(api.userVariants.listAll, {})).length,
    );

    await remove(db, owner, "dash", "one");
    await convexOwner.mutation(api.userVariants.remove, {
      toolKey: "dash",
      variantId: "one",
    });
    expect((await list(db, owner)).some((row) => row.variantId === "one")).toBe(
      false,
    );
    expect(
      (await convexOwner.query(api.userVariants.listAll, {})).some(
        (row) => row.variantId === "one",
      ),
    ).toBe(false);
  });

  it("matches anonymous and other-user denials", async () => {
    const owner = identity();
    const other = identity();
    const convex = convexTest(schema, modules);
    const convexOwner = convex.withIdentity(owner);
    const convexOther = convex.withIdentity(other);
    await getOrCreateUser(db, owner);
    await getOrCreateUser(db, other);
    await convexOwner.mutation(api.users.getOrCreateUser, {});
    await convexOther.mutation(api.users.getOrCreateUser, {});
    await upsert(db, owner, variant("private"));
    await convexOwner.mutation(api.userVariants.upsert, variant("private"));
    await expect(
      upsert(db, ANONYMOUS, variant("anonymous")),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      convexTest(schema, modules).mutation(
        api.userVariants.upsert,
        variant("anonymous"),
      ),
    ).rejects.toThrow("Not authenticated");
    await expect(remove(db, other, "dash", "private")).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      convexOther.mutation(api.userVariants.remove, {
        toolKey: "dash",
        variantId: "private",
      }),
    ).rejects.toThrow("Variant not found");
  });

  it("rejects malformed settings and enforces the bounded PostgreSQL variant count", async () => {
    const owner = identity();
    const convex = convexTest(schema, modules).withIdentity(owner);
    await getOrCreateUser(db, owner);
    await convex.mutation(api.users.getOrCreateUser, {});
    await expect(
      upsert(db, owner, { ...variant("bad"), toolKey: "unknown" }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      convex.mutation(api.userVariants.upsert, {
        ...variant("bad"),
        toolKey: 1,
      } as never),
    ).rejects.toThrow();
    await expect(
      upsert(db, owner, {
        ...variant("large"),
        settings: { blob: "x".repeat(300 * 1024) },
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    for (let index = 0; index < 100; index += 1)
      await upsert(db, owner, variant(`limit-${index}`));
    await expect(
      upsert(db, owner, variant("limit-overflow")),
    ).rejects.toMatchObject({ code: "conflict" });
  });
});
