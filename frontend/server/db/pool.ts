import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { DatabaseConfig } from "./config";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

export function createPool(config: DatabaseConfig): pg.Pool {
  const pool = new pg.Pool({
    connectionString: config.url,
    max: config.poolMax,
    application_name: config.applicationName,
    connectionTimeoutMillis: config.connectTimeoutMs,
    idleTimeoutMillis: 30_000,
    // Server-side limits; 0 disables a limit (migrations).
    statement_timeout: config.statementTimeoutMs || undefined,
    lock_timeout: config.lockTimeoutMs || undefined,
    idle_in_transaction_session_timeout:
      config.idleInTransactionTimeoutMs || undefined,
    // Client-side guard slightly above the server limit.
    query_timeout: config.statementTimeoutMs
      ? config.statementTimeoutMs + 2_000
      : undefined,
  });
  pool.on("error", (error) => {
    console.error(
      "[database] idle PostgreSQL connection failed",
      error.message,
    );
  });
  return pool;
}

export function createDatabase(pool: pg.Pool | pg.PoolClient): Database {
  return drizzle(pool, { schema });
}
