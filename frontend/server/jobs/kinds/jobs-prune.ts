import "server-only";

import { sql } from "drizzle-orm";
import { z } from "zod";
import type { JobKindDefinition } from "../types";

const payloadSchema = z.object({});

const jobsPrune: JobKindDefinition<z.infer<typeof payloadSchema>> = {
  kind: "jobs.prune",
  payloadSchema,
  maxAttempts: 5,
  leaseMs: 5 * 60_000,
  recurringIntervalMs: 24 * 60 * 60_000,
  recurringDedupeKey: "singleton",
  recurringPayload: {},
  async handler(_payload, { db }) {
    // Keep operational history for 30 days. This leaves enough time to
    // investigate a dead job while bounding both tables.
    const finished = await db.execute(
      sql`delete from jobs
          where status in ('done', 'dead')
            and updated_at < now() - interval '30 days'`,
    );
    const runs = await db.execute(
      sql`delete from job_runs
          where created_at < now() - interval '30 days'`,
    );
    return {
      jobsDeleted: finished.rowCount ?? 0,
      runsDeleted: runs.rowCount ?? 0,
    };
  },
};

export default jobsPrune;
