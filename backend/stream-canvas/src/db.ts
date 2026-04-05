import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { config } from "./config.ts";
import * as schema from "./schema.ts";

const sqlite = new Database(config.databasePath);
sqlite.pragma("journal_mode = WAL");

export const db = drizzle({ client: sqlite, schema });

/** Expose the raw better-sqlite3 instance for tldraw's SQLiteSyncStorage. */
export { sqlite };
