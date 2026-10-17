// Read-only cutover smoke checks. The operator supplies paths and identifiers
// in a private fixtures file; no production data is embedded here.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { assertOutsideRepository } from "./import/run";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");
const REQUEST_TIMEOUT_MS = 5_000;

export interface SmokeFixture {
  reads: Array<{ path: string; status?: number }>;
  fileId: string;
  livePath: string;
  jobsPath?: string;
  writePath?: string;
  writeBody?: unknown;
  authFile?: string;
}

export interface SmokeReport {
  ok: boolean;
  checks: Array<{ name: string; ok: boolean; detail?: string }>;
}

type Fetcher = typeof fetch;

function parseFixtures(path: string): SmokeFixture {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!value || typeof value !== "object")
    throw new Error("Invalid smoke fixtures JSON");
  const fixture = value as Partial<SmokeFixture>;
  if (!Array.isArray(fixture.reads) || !fixture.fileId || !fixture.livePath) {
    throw new Error("Smoke fixtures require reads, fileId and livePath");
  }
  return fixture as SmokeFixture;
}

function readAuthFile(path: string | undefined): Headers {
  const headers = new Headers();
  if (!path) return headers;
  const raw = readFileSync(path, "utf8").trim();
  if (!raw) throw new Error("The smoke auth file is empty");
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    const object = parsed as { cookie?: unknown; headers?: unknown };
    if (typeof object.cookie === "string") headers.set("cookie", object.cookie);
    if (object.headers && typeof object.headers === "object") {
      for (const [name, value] of Object.entries(object.headers)) {
        if (typeof value === "string") headers.set(name, value);
      }
    }
  } catch {
    // A plain cookie file is convenient for an operator and is still never
    // exposed as an argument or printed by this command.
    headers.set("cookie", raw);
  }
  return headers;
}

function endpoint(baseUrl: string, path: string): string {
  return new URL(path, baseUrl).toString();
}

async function request(
  fetcher: Fetcher,
  baseUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetcher(endpoint(baseUrl, path), {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function runSmokeChecks(
  baseUrl: string,
  fixtures: SmokeFixture,
  options: {
    expectMaintenance?: boolean;
    auth?: Headers;
    fetcher?: Fetcher;
  } = {},
): Promise<SmokeReport> {
  const fetcher = options.fetcher ?? fetch;
  const checks: SmokeReport["checks"] = [];
  const check = (name: string, ok: boolean, detail?: string) =>
    checks.push({ name, ok, ...(detail ? { detail } : {}) });
  const auth = options.auth ?? new Headers();

  try {
    const response = await request(fetcher, baseUrl, "/api/health/database");
    check(
      "database health",
      response.status === 200,
      `HTTP ${response.status}`,
    );
  } catch (error) {
    check(
      "database health",
      false,
      error instanceof Error ? error.message : "request failed",
    );
  }

  for (const read of fixtures.reads) {
    try {
      const response = await request(fetcher, baseUrl, read.path);
      const expected = read.status ?? 200;
      check(
        `read ${read.path}`,
        response.status === expected,
        `HTTP ${response.status}, expected ${expected}`,
      );
    } catch (error) {
      check(
        `read ${read.path}`,
        false,
        error instanceof Error ? error.message : "request failed",
      );
    }
  }

  try {
    const response = await request(
      fetcher,
      baseUrl,
      `/api/files/${encodeURIComponent(fixtures.fileId)}`,
    );
    const contentType =
      response.headers.get("content-type")?.split(";", 1)[0] ?? "";
    check(
      "file ETag",
      response.status === 200 &&
        contentType.startsWith("image/") &&
        Boolean(response.headers.get("etag")),
      `HTTP ${response.status}`,
    );
  } catch (error) {
    check(
      "file ETag",
      false,
      error instanceof Error ? error.message : "request failed",
    );
  }

  try {
    const response = await request(fetcher, baseUrl, fixtures.livePath, {
      headers: {
        Accept: "text/event-stream",
        ...Object.fromEntries(auth.entries()),
      },
    });
    const reader = response.body?.getReader();
    let first = "";
    if (reader) {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          reader.read(),
          new Promise<never>(
            (_, reject) =>
              (timeout = setTimeout(
                () => reject(new Error("SSE snapshot timeout")),
                REQUEST_TIMEOUT_MS,
              )),
          ),
        ]);
        first = new TextDecoder().decode(result.value);
      } finally {
        if (timeout) clearTimeout(timeout);
        await reader.cancel();
      }
    }
    check(
      "live snapshot",
      response.status === 200 &&
        response.headers
          .get("content-type")
          ?.startsWith("text/event-stream") === true &&
        (first.includes("event: snapshot") || first.includes('"revision"')),
      `HTTP ${response.status}`,
    );
  } catch (error) {
    check(
      "live snapshot",
      false,
      error instanceof Error ? error.message : "request failed",
    );
  }

  try {
    const response = await request(
      fetcher,
      baseUrl,
      fixtures.jobsPath ?? "/api/internal/jobs/status",
      {
        headers: Object.fromEntries(auth.entries()),
      },
    );
    const body: unknown = await response.json();
    const deadJobs =
      body &&
      typeof body === "object" &&
      Array.isArray((body as { deadJobs?: unknown }).deadJobs)
        ? (body as { deadJobs: unknown[] }).deadJobs
        : null;
    check(
      "jobs have no dead rows",
      response.status === 200 && deadJobs?.length === 0,
      `HTTP ${response.status}`,
    );
  } catch (error) {
    check(
      "jobs have no dead rows",
      false,
      error instanceof Error ? error.message : "request failed",
    );
  }

  if (options.expectMaintenance) {
    if (!fixtures.writePath) {
      check(
        "maintenance write",
        false,
        "fixtures.writePath is required with --expect-maintenance",
      );
    } else {
      try {
        const response = await request(fetcher, baseUrl, fixtures.writePath, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...Object.fromEntries(auth.entries()),
          },
          body: JSON.stringify(fixtures.writeBody ?? {}),
        });
        const body: unknown = await response.json().catch(() => null);
        const maintenanceBody =
          typeof body === "object" &&
          body !== null &&
          (body as { error?: unknown }).error ===
            "Service is in maintenance mode" &&
          (body as { code?: unknown }).code === "unavailable";
        check(
          "maintenance write",
          response.status === 503 &&
            response.headers.get("retry-after") === "60" &&
            maintenanceBody,
          `HTTP ${response.status}`,
        );
      } catch (error) {
        check(
          "maintenance write",
          false,
          error instanceof Error ? error.message : "request failed",
        );
      }
    }
  }

  return { ok: checks.every((item) => item.ok), checks };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "base-url": { type: "string" },
      fixtures: { type: "string" },
      "auth-file": { type: "string" },
      "expect-maintenance": { type: "boolean", default: false },
      "report-dir": { type: "string" },
    },
  });
  if (!values["base-url"] || !values.fixtures)
    throw new Error("--base-url and --fixtures are required");
  assertOutsideRepository(values.fixtures, REPO_ROOT, "The smoke fixtures");
  if (values["auth-file"])
    assertOutsideRepository(
      values["auth-file"],
      REPO_ROOT,
      "The smoke auth file",
    );
  const fixtures = parseFixtures(values.fixtures);
  const authPath = values["auth-file"] ?? fixtures.authFile;
  if (authPath)
    assertOutsideRepository(authPath, REPO_ROOT, "The smoke auth file");
  const report = await runSmokeChecks(values["base-url"], fixtures, {
    expectMaintenance: values["expect-maintenance"],
    auth: readAuthFile(authPath),
  });
  if (values["report-dir"]) {
    assertOutsideRepository(
      values["report-dir"],
      REPO_ROOT,
      "The report directory",
    );
    mkdirSync(values["report-dir"], { recursive: true, mode: 0o700 });
    writeFileSync(
      join(values["report-dir"], "smoke-cutover.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      { mode: 0o600 },
    );
  }
  console.log(
    `[smoke:cutover] ${report.ok ? "OK" : "FAILED"}; ${report.checks.filter((item) => item.ok).length}/${report.checks.length} checks passed`,
  );
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(
      "[smoke:cutover] failed:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  });
}
