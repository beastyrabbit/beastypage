import { randomBytes } from "node:crypto";
import pg from "pg";
import type { TestProject } from "vitest/node";
import { loadLocalDatabaseEnv } from "../scripts/db/env";
import { readDatabaseConfig } from "../server/db/config";
import { runMigrations } from "../server/db/migrator";
import { createPool } from "../server/db/pool";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/**
 * Creates a throwaway database next to DATABASE_URL, migrates it with the
 * production runner, and drops it afterwards. The developer's own database
 * is never written.
 */
export default async function setup(project: TestProject) {
  loadLocalDatabaseEnv();
  const adminUrl = readDatabaseConfig("migrate").url;
  const name = `beastypage_test_${randomBytes(4).toString("hex")}`;

  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const pool = createPool(
    readDatabaseConfig("migrate", {
      ...process.env,
      DATABASE_URL: url.toString(),
    }),
  );
  const client = await pool.connect();
  try {
    await runMigrations(client, "test");
  } finally {
    client.release();
    await pool.end();
  }

  project.provide("databaseUrl", url.toString());

  return async () => {
    const cleanup = new pg.Client({ connectionString: adminUrl });
    await cleanup.connect();
    await cleanup.query(`drop database if exists ${name} with (force)`);
    await cleanup.end();
  };
}
