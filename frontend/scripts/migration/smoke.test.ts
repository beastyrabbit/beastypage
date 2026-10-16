import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { runSmokeChecks, type SmokeFixture } from "./smoke";

let server: Server | undefined;

afterEach(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = undefined;
});

describe("cutover smoke checks", () => {
  it("passes against a local route-handler-style fake server", async () => {
    server = createServer((request, response) => {
      if (request.url === "/api/files/file-1") {
        response.writeHead(200, {
          "content-type": "image/png",
          etag: '"fixture"',
        });
        response.end("png");
        return;
      }
      if (request.url === "/live/topic") {
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end('event: snapshot\ndata: {"revision":1}\n\n');
        return;
      }
      if (request.url === "/api/internal/jobs/status") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end('{"deadJobs":[]}');
        return;
      }
      if (request.url === "/write") {
        response.writeHead(503, {
          "content-type": "application/json",
          "retry-after": "60",
        });
        response.end(
          '{"error":"Service is in maintenance mode","code":"unavailable"}',
        );
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{}");
    }).listen(0, "127.0.0.1");
    await new Promise<void>((resolve) =>
      server?.once("listening", () => resolve()),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("server did not start");
    const fixtures: SmokeFixture = {
      reads: [{ path: "/read" }],
      fileId: "file-1",
      livePath: "/live/topic",
      writePath: "/write",
    };
    const report = await runSmokeChecks(
      `http://127.0.0.1:${address.port}`,
      fixtures,
      {
        expectMaintenance: true,
      },
    );
    expect(report.ok).toBe(true);
    expect(report.checks).toHaveLength(6);
  });

  it("rejects an unrelated 503 as the maintenance gate", async () => {
    server = createServer((request, response) => {
      if (request.url === "/write") {
        response.writeHead(503, {
          "content-type": "application/json",
          "retry-after": "60",
        });
        response.end('{"error":"database unavailable","code":"unavailable"}');
        return;
      }
      if (request.url === "/api/files/file-1") {
        response.writeHead(200, {
          "content-type": "image/png",
          etag: '"fixture"',
        });
        response.end("png");
        return;
      }
      if (request.url === "/live/topic") {
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end('event: snapshot\ndata: {"revision":1}\n\n');
        return;
      }
      if (request.url === "/api/internal/jobs/status") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end('{"deadJobs":[]}');
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{}");
    }).listen(0, "127.0.0.1");
    await new Promise<void>((resolve) =>
      server?.once("listening", () => resolve()),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("server did not start");
    const report = await runSmokeChecks(
      `http://127.0.0.1:${address.port}`,
      {
        reads: [{ path: "/read" }],
        fileId: "file-1",
        livePath: "/live/topic",
        writePath: "/write",
      },
      { expectMaintenance: true },
    );
    expect(report.ok).toBe(false);
    expect(
      report.checks.find((check) => check.name === "maintenance write")?.ok,
    ).toBe(false);
  });
});
