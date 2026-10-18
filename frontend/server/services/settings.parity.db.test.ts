/// <reference types="vite/client" />
// Parity: convex/settings.ts and server/services/settings.ts run the same
// scenarios and must agree on results and refusals (#113).
import { convexTest } from "convex-test";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { readDatabaseConfig } from "../db/config";
import { createDatabase, createPool, type Database } from "../db/pool";
import { dashSettings } from "../db/schema";
import { ServiceError } from "../errors";
import { getSettings, saveSettings } from "./settings";

const modules = import.meta.glob("../../convex/**/*.ts");
const OWNER = "https://clerk.parity.test|user_owner";

let pool: pg.Pool;
let db: Database;

beforeAll(() => {
  pool = createPool(
    readDatabaseConfig("app", { DATABASE_URL: inject("databaseUrl") }),
  );
  db = createDatabase(pool);
});

afterAll(async () => {
  await pool.end();
});

type Outcome =
  | { ok: true; updated: boolean; slug: string; hasEditToken: boolean }
  | { ok: false; message: string };

interface Backend {
  save(
    args: { config: unknown; slug?: string; editToken?: string },
    owner?: string,
  ): Promise<{
    slug: string;
    updated: boolean;
    editToken?: string;
  }>;
  get(slug: string): Promise<{ slug: string; config: unknown } | null>;
  seedLegacy(slug: string): Promise<void>;
}

function convexBackend(): Backend {
  const t = convexTest(schema, modules);
  return {
    save: (args, owner) =>
      (owner ? t.withIdentity({ tokenIdentifier: owner }) : t).mutation(
        api.dashSettings.save,
        args,
      ),
    get: (slug) => t.query(api.dashSettings.get, { slug }),
    seedLegacy: async (slug) => {
      await t.run(async (ctx) => {
        await ctx.db.insert("dash_settings", {
          slug,
          config: { v: 1 },
          createdAt: 1,
          updatedAt: 1,
        });
      });
    },
  };
}

function postgresBackend(): Backend {
  return {
    save: (args, owner) =>
      saveSettings(db, "dash", args, { tokenIdentifier: owner ?? null }),
    get: (slug) => getSettings(db, "dash", slug),
    seedLegacy: async (slug) => {
      await db.insert(dashSettings).values({ slug, config: { v: 1 } });
    },
  };
}

async function outcome(
  run: () => Promise<{ slug: string; updated: boolean; editToken?: string }>,
): Promise<Outcome> {
  try {
    const result = await run();
    return {
      ok: true,
      updated: result.updated,
      slug: result.slug,
      hasEditToken: Boolean(result.editToken),
    };
  } catch (error) {
    if (error instanceof ServiceError || error instanceof Error) {
      return {
        ok: false,
        message:
          error.message.match(
            /(Not authorized to edit settings|Invalid slug format|Settings payload is too large)/,
          )?.[1] ?? error.message,
      };
    }
    throw error;
  }
}

/** The scenario script; `prefix` keeps slugs unique per backend in the shared database. */
async function scenario(backend: Backend, prefix: string) {
  const results: Record<string, Outcome | unknown> = {};
  const config = { v: 1, widgets: ["wheel"], lastSeenVersion: null };

  const created = await backend.save({ config });
  results.generatedSlug =
    created.slug.length === 7 && /^[2-9A-HJ-NP-Za-km-z]+$/.test(created.slug);
  results.created = {
    updated: created.updated,
    hasEditToken: Boolean(created.editToken),
  };

  const explicit = `${prefix}Explicit1`;
  results.explicitCreate = await outcome(() =>
    backend.save({ config, slug: explicit }),
  );
  const token = (await backend.save({ config, slug: `${prefix}Tok` }))
    .editToken;
  results.editWithToken = await outcome(() =>
    backend.save({
      config: { ...config, widgets: ["dash"] },
      slug: `${prefix}Tok`,
      editToken: token,
    }),
  );
  results.readBack = (await backend.get(`${prefix}Tok`))?.config;
  results.editWrongToken = await outcome(() =>
    backend.save({ config, slug: `${prefix}Tok`, editToken: "not-the-token" }),
  );
  results.editNoToken = await outcome(() =>
    backend.save({ config, slug: `${prefix}Tok` }),
  );

  await backend.save({ config, slug: `${prefix}Own` }, OWNER);
  results.ownerEdit = await outcome(() =>
    backend.save({ config, slug: `${prefix}Own` }, OWNER),
  );
  results.otherUserEdit = await outcome(() =>
    backend.save(
      { config, slug: `${prefix}Own` },
      "https://clerk.parity.test|user_other",
    ),
  );

  await backend.seedLegacy(`${prefix}Legacy`);
  results.legacyReadOnly = await outcome(() =>
    backend.save({ config, slug: `${prefix}Legacy` }),
  );

  results.badSlug = await outcome(() =>
    backend.save({ config, slug: "has space" }),
  );
  results.tooLarge = await outcome(() =>
    backend.save({ config: { v: 1, blob: "x".repeat(257 * 1024) } }),
  );
  results.missing = await backend.get(`${prefix}Missing`);
  // Normalize the per-backend slug prefix away.
  return JSON.parse(JSON.stringify(results).replaceAll(prefix, "P"));
}

describe("settings parity (Convex vs PostgreSQL)", () => {
  it("agrees on results and refusals", async () => {
    const convex = await scenario(convexBackend(), "cvx");
    const postgres = await scenario(postgresBackend(), "pgs");
    expect(postgres).toEqual(convex);
    // Sanity: the script really exercised both paths.
    expect(convex.editWrongToken).toEqual({
      ok: false,
      message: "Not authorized to edit settings",
    });
    expect(convex.ownerEdit).toMatchObject({ ok: true, updated: true });
  });

  it("documents the one intended difference: contract validation", async () => {
    const malformed = { v: 1, widgets: "wheel" };
    await expect(
      convexBackend().save({ config: malformed }),
    ).resolves.toMatchObject({ updated: false });
    await expect(
      postgresBackend().save({ config: malformed }),
    ).rejects.toMatchObject({
      code: "invalid_input",
      message: "Invalid config",
    });
  });

  it("serializes a concurrent create of one slug into create + authorized edit", async () => {
    const config = { v: 1, widgets: [] };
    const results = await Promise.allSettled([
      saveSettings(
        db,
        "dash",
        { config, slug: "raceSlug" },
        { tokenIdentifier: null },
      ),
      saveSettings(
        db,
        "dash",
        { config, slug: "raceSlug" },
        { tokenIdentifier: null },
      ),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    // One wins; the other found an existing row without a matching token.
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: "forbidden",
    });
  });
});
