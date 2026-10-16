import { createServer } from "node:http";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { readDatabaseConfig } from "../../db/config";
import { createDatabase, createPool, type Database } from "../../db/pool";
import { getJobKind } from ".";

let pool: pg.Pool;
let db: Database;

beforeAll(() => {
  pool = createPool(
    readDatabaseConfig("app", { DATABASE_URL: inject("databaseUrl") }),
  );
  db = createDatabase(pool);
});

afterAll(() => pool.end());

describe("Quick Share jobs", () => {
  it("dispatches to a fake media endpoint with the worker contract", async () => {
    const calls: { url: string; token: string | undefined }[] = [];
    const server = createServer((request, response) => {
      calls.push({
        url: request.url ?? "",
        token: request.headers["x-quick-share-internal-token"] as
          | string
          | undefined,
      });
      response.writeHead(202).end();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("server did not start");
    const previousUrl = process.env.QUICK_SHARE_WORKER_URL;
    const previousToken = process.env.QUICK_SHARE_INTERNAL_TOKEN;
    process.env.QUICK_SHARE_WORKER_URL = `http://127.0.0.1:${address.port}`;
    process.env.QUICK_SHARE_INTERNAL_TOKEN = "test-worker-token";
    try {
      const definition = getJobKind("quick-share.dispatch");
      if (!definition) throw new Error("job kind is not registered");
      const result = await definition.handler(
        { jobId: "00000000-0000-4000-8000-000000000001", attempt: 0 },
        {
          db,
          jobId: "job",
          kind: definition.kind,
          attempt: 1,
          signal: new AbortController().signal,
        },
      );
      expect(result).toEqual({ dispatched: 1 });
      expect(calls).toEqual([
        {
          url: "/i/api/internal/jobs/00000000-0000-4000-8000-000000000001",
          token: "test-worker-token",
        },
      ]);
    } finally {
      if (previousUrl === undefined) delete process.env.QUICK_SHARE_WORKER_URL;
      else process.env.QUICK_SHARE_WORKER_URL = previousUrl;
      if (previousToken === undefined)
        delete process.env.QUICK_SHARE_INTERNAL_TOKEN;
      else process.env.QUICK_SHARE_INTERNAL_TOKEN = previousToken;
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
