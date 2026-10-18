import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Per-worktree database settings written by `pnpm run db:local up` (gitignored). */
export const LOCAL_ENV_FILE = resolve(
  import.meta.dirname,
  "../../.env.database.local",
);

/**
 * CLI scripts fall back to the local worktree database when DATABASE_URL is
 * unset. The Next.js server never does; it must be configured explicitly.
 */
export function loadLocalDatabaseEnv(): void {
  if (!process.env.DATABASE_URL && existsSync(LOCAL_ENV_FILE)) {
    process.loadEnvFile(LOCAL_ENV_FILE);
  }
}
