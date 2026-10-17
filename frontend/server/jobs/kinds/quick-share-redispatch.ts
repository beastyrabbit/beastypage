import "server-only";

import { z } from "zod";
import { redispatchQuickSharePending } from "../../services/quickShare";
import type { JobKindDefinition } from "../types";

const payloadSchema = z.object({});

const quickShareRedispatch: JobKindDefinition<z.infer<typeof payloadSchema>> = {
  kind: "quick-share.redispatch",
  payloadSchema,
  maxAttempts: 5,
  leaseMs: 5 * 60_000,
  async handler(_payload, { db }) {
    return redispatchQuickSharePending(db);
  },
};

export default quickShareRedispatch;
