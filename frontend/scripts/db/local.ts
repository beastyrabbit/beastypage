// Per-worktree PostgreSQL for local development.
// Run: pnpm --dir frontend run db:local <up|down|status|url|psql|destroy --yes>
//
// Each worktree gets its own container, volume, loopback port and password,
// all derived from the worktree path. Settings land in frontend/.env.database.local
// (gitignored), which the database scripts and tests read.

import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { LOCAL_ENV_FILE } from "./env";

const IMAGE = "postgres:18.6-alpine";
const DATABASE = "beastypage";
const USER = "beastypage";

const repoRoot = realpathSync(resolve(import.meta.dirname, "../../.."));
const worktreeId = createHash("sha256")
  .update(repoRoot)
  .digest("hex")
  .slice(0, 10);
const container = `beastypage-pg-${worktreeId}`;
const volume = `beastypage-pg-${worktreeId}`;

function docker(args: string[], options: { quiet?: boolean } = {}): string {
  try {
    return execFileSync("docker", args, {
      encoding: "utf8",
      stdio: options.quiet
        ? ["ignore", "pipe", "ignore"]
        : ["ignore", "pipe", "inherit"],
    }).trim();
  } catch (error) {
    if (options.quiet) return "";
    throw error;
  }
}

function containerState(): "missing" | "running" | "stopped" {
  const state = docker(["inspect", "-f", "{{.State.Running}}", container], {
    quiet: true,
  });
  if (!state) return "missing";
  return state === "true" ? "running" : "stopped";
}

function readSettings(): { port: number; password: string } | null {
  if (!existsSync(LOCAL_ENV_FILE)) return null;
  const text = readFileSync(LOCAL_ENV_FILE, "utf8");
  const port = Number(/^DATABASE_LOCAL_PORT=(\d+)$/m.exec(text)?.[1]);
  const password = /^DATABASE_LOCAL_PASSWORD=(\S+)$/m.exec(text)?.[1];
  return port && password ? { port, password } : null;
}

function portFree(port: number): Promise<boolean> {
  return new Promise((done) => {
    const server = createServer();
    server.once("error", () => done(false));
    server.listen(port, "127.0.0.1", () => server.close(() => done(true)));
  });
}

async function choosePort(): Promise<number> {
  const preferred = Number(process.env.DATABASE_LOCAL_PORT);
  if (preferred) return preferred;
  const start = 54_000 + (Number.parseInt(worktreeId.slice(0, 4), 16) % 900);
  for (let port = start; port < start + 50; port++) {
    if (await portFree(port)) return port;
  }
  throw new Error(
    "No free loopback port near the worktree default; set DATABASE_LOCAL_PORT.",
  );
}

function url(settings: { port: number; password: string }): string {
  return `postgresql://${USER}:${settings.password}@127.0.0.1:${settings.port}/${DATABASE}`;
}

function writeSettings(settings: { port: number; password: string }): void {
  writeFileSync(
    LOCAL_ENV_FILE,
    [
      "# Written by `pnpm run db:local up`. Local only; never commit.",
      `DATABASE_LOCAL_PORT=${settings.port}`,
      `DATABASE_LOCAL_PASSWORD=${settings.password}`,
      `DATABASE_URL=${url(settings)}`,
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
}

async function waitReady(): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const ready = spawnSync(
      "docker",
      [
        "exec",
        container,
        "pg_isready",
        "-U",
        USER,
        "-d",
        DATABASE,
        "-h",
        "127.0.0.1",
      ],
      { stdio: "ignore" },
    );
    if (ready.status === 0) return;
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`${container} did not become ready within 60 s`);
}

async function up(): Promise<void> {
  let settings = readSettings();
  const state = containerState();
  if (state === "missing") {
    settings ??= {
      port: await choosePort(),
      password: randomBytes(18).toString("base64url"),
    };
    docker([
      "run",
      "-d",
      "--name",
      container,
      "--label",
      `beastypage.worktree=${repoRoot}`,
      "-e",
      `POSTGRES_DB=${DATABASE}`,
      "-e",
      `POSTGRES_USER=${USER}`,
      "-e",
      `POSTGRES_PASSWORD=${settings.password}`,
      "-p",
      `127.0.0.1:${settings.port}:5432`,
      "-v",
      `${volume}:/var/lib/postgresql`,
      IMAGE,
    ]);
    writeSettings(settings);
  } else if (state === "stopped") {
    docker(["start", container]);
  }
  if (!settings) {
    throw new Error(
      `${container} exists but ${LOCAL_ENV_FILE} is missing; run destroy --yes and up again.`,
    );
  }
  await waitReady();
  console.log(
    `PostgreSQL for this worktree is ready: ${container} on 127.0.0.1:${settings.port}`,
  );
  console.log(`Settings: ${LOCAL_ENV_FILE}`);
}

async function main(): Promise<void> {
  const [command = "status", ...rest] = process.argv.slice(2);
  switch (command) {
    case "up":
      await up();
      return;
    case "down":
      if (containerState() === "running") docker(["stop", container]);
      console.log(`${container} stopped`);
      return;
    case "status": {
      const settings = readSettings();
      console.log(
        `${container}: ${containerState()}${settings ? ` (127.0.0.1:${settings.port})` : ""}`,
      );
      return;
    }
    case "url": {
      const settings = readSettings();
      if (!settings)
        throw new Error("No local database yet; run `db:local up`.");
      console.log(url(settings));
      return;
    }
    case "psql": {
      const result = spawnSync(
        "docker",
        ["exec", "-it", container, "psql", "-U", USER, "-d", DATABASE, ...rest],
        { stdio: "inherit" },
      );
      process.exitCode = result.status ?? 1;
      return;
    }
    case "destroy":
      if (!rest.includes("--yes")) {
        throw new Error(
          `This deletes ${container} and volume ${volume}. Re-run with --yes.`,
        );
      }
      docker(["rm", "-f", container], { quiet: true });
      docker(["volume", "rm", volume], { quiet: true });
      if (existsSync(LOCAL_ENV_FILE)) writeFileSync(LOCAL_ENV_FILE, "");
      console.log(`${container} and ${volume} removed`);
      return;
    default:
      throw new Error(
        `Unknown command "${command}". Use up, down, status, url, psql or destroy --yes.`,
      );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
