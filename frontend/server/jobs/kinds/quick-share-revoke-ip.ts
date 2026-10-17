import "server-only";

import { z } from "zod";
import { revokeQuickShareIpBatch } from "../../services/quickShare";
import type { JobKindDefinition } from "../types";

const payloadSchema = z.object({
  ipHash: z.string().min(1),
  now: z.number().finite().optional(),
});

const quickShareRevokeIp: JobKindDefinition<z.infer<typeof payloadSchema>> = {
  kind: "quick-share.revoke-ip",
  payloadSchema,
  maxAttempts: 5,
  leaseMs: 30_000,
  async handler(payload, { db }) {
    return revokeQuickShareIpBatch(
      db,
      payload.ipHash,
      payload.now ?? Date.now(),
    );
  },
};

export default quickShareRevokeIp;
