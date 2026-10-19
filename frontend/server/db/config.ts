/** Which credentials a process uses; see docs/migration/adr-0001-postgresql.md §3. */
export type DatabaseRole = "app" | "migrate";

export interface DatabaseConfig {
  url: string;
  role: DatabaseRole;
  poolMax: number;
  applicationName: string;
  connectTimeoutMs: number;
  statementTimeoutMs: number;
  lockTimeoutMs: number;
  idleInTransactionTimeoutMs: number;
}

const ROLE_DEFAULTS: Record<
  DatabaseRole,
  Omit<DatabaseConfig, "url" | "role" | "applicationName">
> = {
  app: {
    poolMax: 6,
    connectTimeoutMs: 5_000,
    statementTimeoutMs: 5_000,
    lockTimeoutMs: 2_000,
    idleInTransactionTimeoutMs: 10_000,
  },
  migrate: {
    poolMax: 1,
    connectTimeoutMs: 10_000,
    statementTimeoutMs: 0,
    lockTimeoutMs: 10_000,
    idleInTransactionTimeoutMs: 60_000,
  },
};

const URL_VARIABLE: Record<DatabaseRole, string[]> = {
  app: ["DATABASE_URL"],
  migrate: ["DATABASE_MIGRATION_URL", "DATABASE_URL"],
};

export const LOOPBACK_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
]);

type Environment = Readonly<Record<string, string | undefined>>;

function positiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Expected a non-negative integer, got "${value}"`);
  }
  return parsed;
}

/**
 * Production connections must verify the server certificate. Loopback hosts
 * (local development, CI service containers) are exempt.
 */
export function assertSecureConnection(
  url: string,
  env: Environment = process.env,
): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Database URL is not a valid URL");
  }
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
    throw new Error("Database URL must use the postgres:// scheme");
  }
  if (env.NODE_ENV !== "production") return;
  if (LOOPBACK_HOSTS.has(parsed.hostname)) return;
  if (env.DATABASE_ALLOW_INSECURE === "1") return;
  if (parsed.searchParams.get("sslmode") !== "verify-full") {
    throw new Error(
      "Production database connections require sslmode=verify-full (set DATABASE_ALLOW_INSECURE=1 only for a documented exception)",
    );
  }
}

export function readDatabaseConfig(
  role: DatabaseRole = "app",
  env: Environment = process.env,
): DatabaseConfig {
  const variable = URL_VARIABLE[role].find((name) => env[name]?.trim());
  const url = variable ? env[variable]?.trim() : undefined;
  if (!url) {
    throw new Error(
      `${URL_VARIABLE[role].join(" or ")} is not set. Run \`pnpm --dir frontend run db:local up\` for a local database.`,
    );
  }
  assertSecureConnection(url, env);
  const defaults = ROLE_DEFAULTS[role];
  return {
    url,
    role,
    applicationName: env.DATABASE_APPLICATION_NAME ?? `beastypage-${role}`,
    poolMax: positiveInt(env.DATABASE_POOL_MAX, defaults.poolMax),
    connectTimeoutMs: positiveInt(
      env.DATABASE_CONNECT_TIMEOUT_MS,
      defaults.connectTimeoutMs,
    ),
    statementTimeoutMs: positiveInt(
      env.DATABASE_STATEMENT_TIMEOUT_MS,
      defaults.statementTimeoutMs,
    ),
    lockTimeoutMs: positiveInt(
      env.DATABASE_LOCK_TIMEOUT_MS,
      defaults.lockTimeoutMs,
    ),
    idleInTransactionTimeoutMs: positiveInt(
      env.DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_MS,
      defaults.idleInTransactionTimeoutMs,
    ),
  };
}
