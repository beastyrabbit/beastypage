import "server-only";

import { z } from "zod";
import { recoverQuickShareLease } from "../../services/quickShare";
import type { JobKindDefinition } from "../types";

const payloadSchema = z.object({
  jobId: z.string().uuid(),
  leaseId: z.string().min(1),
});

const quickShareRecoverLease: JobKindDefinition<z.infer<typeof payloadSchema>> =
  {
    kind: "quick-share.recover-lease",
    payloadSchema,
    maxAttempts: 5,
    leaseMs: 30_000,
    async handler(payload, { db }) {
      const result = await recoverQuickShareLease(
        db,
        payload.jobId,
        payload.leaseId,
      );
      return { recovered: result.recovered ? 1 : 0 };
    },
  };

export default quickShareRecoverLease;
