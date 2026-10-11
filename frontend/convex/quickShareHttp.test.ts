/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("retries a busy worker beyond the old horizon and then stops", async () => {
  const t = convexTest(schema, modules);
  vi.stubEnv("QUICK_SHARE_WORKER_URL", "https://worker.example");
  vi.stubEnv("QUICK_SHARE_INTERNAL_TOKEN", "test-only-dispatch-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 503 })),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});

  const jobId = await t.run(async (ctx) => {
    const now = Date.now();
    const uploadId = await ctx.db.insert("quick_share_uploads", {
      slug: "RetryJob",
      source: "file",
      originalName: "retry.jpg",
      originalSize: 1,
      originalKey: "originals/retry-job",
      state: "processing",
      receiptHash: "test-receipt",
      rateIdentity: "ip:test-retry",
      ipHash: "test-retry",
      rawIp: "192.0.2.1",
      publicExpiresAt: now + 60_000,
      retainedUntil: now + 60_000,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    return ctx.db.insert("quick_share_jobs", {
      uploadId,
      kind: "process",
      status: "pending",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    });
  });

  await t.action(internal.quickShareHttp.dispatchJob, { jobId, attempt: 5 });
  const scheduled = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  expect(scheduled).toHaveLength(1);
  expect(scheduled[0].name).toMatch(/:retryDispatchJob$/);
  expect(scheduled[0].args).toEqual([{ jobId, attempt: 6 }]);

  await t.action(internal.quickShareHttp.dispatchJob, { jobId, attempt: 7 });
  expect(
    await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect()),
  ).toHaveLength(1);
});
