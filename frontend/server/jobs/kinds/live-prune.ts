import "server-only";

import { sql } from "drizzle-orm";
import { z } from "zod";
import type { JobKindDefinition } from "../types";

const payloadSchema = z.object({});

const livePrune: JobKindDefinition<z.infer<typeof payloadSchema>> = {
  kind: "live.prune",
  payloadSchema,
  maxAttempts: 5,
  leaseMs: 5 * 60_000,
  recurringIntervalMs: 60 * 60_000,
  recurringDedupeKey: "singleton",
  recurringPayload: {},
  async handler(_payload, { db }) {
    const result = await db.execute(
      sql`delete from live_events where created_at < now() - interval '1 hour'`,
    );
    return { deleted: result.rowCount ?? 0 };
  },
};

export default livePrune;
