import "server-only";

import { z } from "zod";
import { withTransaction } from "../../db/transaction";
import { enqueueJob } from "../enqueue";
import type { JobCounts, JobKindDefinition } from "../types";

const RETRY_DELAYS_MS = [
  1_000,
  5_000,
  15_000,
  60_000,
  5 * 60_000,
  15 * 60_000,
  30 * 60_000,
] as const;

const payloadSchema = z.object({
  jobId: z.string().uuid(),
  attempt: z.number().int().nonnegative(),
});

const quickShareDispatch: JobKindDefinition<z.infer<typeof payloadSchema>> = {
  kind: "quick-share.dispatch",
  payloadSchema,
  maxAttempts: 1,
  leaseMs: 30_000,
  async handler(payload, { db }): Promise<JobCounts> {
    const workerUrl = process.env.QUICK_SHARE_WORKER_URL;
    const internalToken = process.env.QUICK_SHARE_INTERNAL_TOKEN;
    try {
      if (!workerUrl || !internalToken)
        throw new Error("Quick Share worker dispatch is not configured");
      const url = new URL(
        `/i/api/internal/jobs/${encodeURIComponent(payload.jobId)}`,
        workerUrl,
      );
      const response = await fetch(url, {
        method: "POST",
        headers: { "x-quick-share-internal-token": internalToken },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok)
        throw new Error(`Quick Share worker returned ${response.status}`);
      return { dispatched: 1 };
    } catch (error) {
      if (payload.attempt >= RETRY_DELAYS_MS.length) throw error;
      const nextAttempt = payload.attempt + 1;
      await withTransaction(db, async (tx) => {
        await enqueueJob(tx, {
          kind: "quick-share.dispatch",
          dedupeKey: `${payload.jobId}:${nextAttempt}`,
          payload: { jobId: payload.jobId, attempt: nextAttempt },
          runAfter: new Date(Date.now() + RETRY_DELAYS_MS[payload.attempt]),
        });
      });
      return { retryScheduled: 1 };
    }
  },
};

export default quickShareDispatch;
