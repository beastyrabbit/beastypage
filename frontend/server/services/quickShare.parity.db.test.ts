/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { readDatabaseConfig } from "../db/config";
import { createDatabase, createPool, type Database } from "../db/pool";
import { handleQuickShareOperation } from "./quickShare";

const modules = import.meta.glob("../../convex/**/*.ts");
let pool: pg.Pool;
let db: Database;

beforeAll(() => {
  pool = createPool(
    readDatabaseConfig("app", { DATABASE_URL: inject("databaseUrl") }),
  );
  db = createDatabase(pool);
});

afterAll(() => pool.end());

describe("Quick Share Convex/PostgreSQL parity", () => {
  it("agrees on policy, malformed input, missing reads and anonymous denial", async () => {
    const convex = convexTest(schema, modules);
    const convexPolicy = await convex.query(internal.quickShare.policy, {
      tier: "anonymous",
    });
    const postgresPolicy = await handleQuickShareOperation(
      db,
      "policy",
      { op: "policy" },
      { tokenIdentifier: null },
    );
    expect(postgresPolicy).toEqual({ status: 200, body: convexPolicy });
    const convexSignedInPolicy = await convex.query(
      internal.quickShare.policy,
      {
        tier: "signedIn",
      },
    );
    const postgresSignedInPolicy = await handleQuickShareOperation(
      db,
      "policy",
      { op: "policy" },
      { tokenIdentifier: "https://clerk.quick-share.test|policy-owner" },
    );
    expect(postgresSignedInPolicy).toEqual({
      status: 200,
      body: convexSignedInPolicy,
    });

    await expect(
      convex.mutation(internal.quickShare.createUpload, {
        slug: "bad",
        source: "file",
        originalName: "x",
        originalSize: 0,
        originalKey: "originals/x",
        receiptHash: "r",
        rateIdentity: "ip:x",
        ipHash: "h",
        rawIp: "192.0.2.1",
        tier: "anonymous",
        now: 1,
      }),
    ).rejects.toThrow("INVALID_SIZE");
    await expect(
      handleQuickShareOperation(
        db,
        "create",
        {
          slug: "bad",
          source: "file",
          originalName: "x",
          originalSize: 0,
          originalKey: "originals/x",
          receiptHash: "r",
          rateIdentity: "ip:x",
          ipHash: "h",
          rawIp: "192.0.2.1",
        },
        { tokenIdentifier: null },
        1,
      ),
    ).rejects.toThrow("INVALID_SIZE");

    const convexMissing = await convex.query(
      internal.quickShare.getPublicUpload,
      { slug: "Missing1", now: 1 },
    );
    const postgresMissing = await handleQuickShareOperation(
      db,
      "public",
      { slug: "Missing1" },
      { tokenIdentifier: null },
      1,
    );
    expect(convexMissing).toBeNull();
    expect(postgresMissing).toEqual({
      status: 404,
      body: { error: "Not found" },
    });

    const postgresAccount = await handleQuickShareOperation(
      db,
      "accountList",
      {},
      { tokenIdentifier: null },
    );
    expect(postgresAccount).toEqual({
      status: 401,
      body: { error: "Unauthorized" },
    });
  });
});
