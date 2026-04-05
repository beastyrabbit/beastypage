import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { config } from "./config.ts";
import * as schema from "./schema.ts";

const sqlite = new Database(config.databasePath);
sqlite.pragma("journal_mode = WAL");

// Auto-create tables on startup (idempotent)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    owner_clerk_id TEXT NOT NULL UNIQUE,
    twitch_channel TEXT,
    obs_secret TEXT NOT NULL,
    allowed_users TEXT,
    created_at INTEGER,
    updated_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS uploads (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES rooms(id),
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    path TEXT NOT NULL,
    created_at INTEGER
  );
`);

export const db = drizzle({ client: sqlite, schema });

/** Expose the raw better-sqlite3 instance for tldraw's SQLiteSyncStorage. */
export { sqlite };
