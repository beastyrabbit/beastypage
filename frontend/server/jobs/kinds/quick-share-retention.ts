import "server-only";

import { z } from "zod";
import { maintainQuickShare } from "../../services/quickShare";
import type { JobKindDefinition } from "../types";

const payloadSchema = z.object({});

const quickShareRetention: JobKindDefinition<z.infer<typeof payloadSchema>> = {
  kind: "quick-share.retention",
  payloadSchema,
  maxAttempts: 5,
  leaseMs: 5 * 60_000,
  recurringIntervalMs: 60 * 60_000,
  recurringDedupeKey: "singleton",
  recurringPayload: {},
  async handler(_payload, { db }) {
    return maintainQuickShare(db);
  },
};

export default quickShareRetention;
