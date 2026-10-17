import "server-only";
import type pg from "pg";
import { readDatabaseConfig } from "./config";
import { createDatabase, createPool, type Database } from "./pool";

// One pool per server process. Lazy, so `next build` and pages that never
// touch PostgreSQL do not need DATABASE_URL.
const globalForDatabase = globalThis as typeof globalThis & {
  __beastypagePool?: pg.Pool;
  __beastypageDb?: Database;
};

export function getPool(): pg.Pool {
  globalForDatabase.__beastypagePool ??= createPool(readDatabaseConfig("app"));
  return globalForDatabase.__beastypagePool;
}

export function getDb(): Database {
  globalForDatabase.__beastypageDb ??= createDatabase(getPool());
  return globalForDatabase.__beastypageDb;
}

export async function closeDatabase(): Promise<void> {
  const pool = globalForDatabase.__beastypagePool;
  globalForDatabase.__beastypagePool = undefined;
  globalForDatabase.__beastypageDb = undefined;
  await pool?.end();
}
