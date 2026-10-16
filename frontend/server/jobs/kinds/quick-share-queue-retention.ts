import "server-only";

import { z } from "zod";
import { queueQuickShareRetentionDeletes } from "../../services/quickShare";
import type { JobKindDefinition } from "../types";

const payloadSchema = z.object({ now: z.number().finite().optional() });

const quickShareQueueRetention: JobKindDefinition<
  z.infer<typeof payloadSchema>
> = {
  kind: "quick-share.queue-retention",
  payloadSchema,
  maxAttempts: 5,
  leaseMs: 5 * 60_000,
  async handler(payload, { db }) {
    return queueQuickShareRetentionDeletes(db, payload.now ?? Date.now());
  },
};

export default quickShareQueueRetention;
