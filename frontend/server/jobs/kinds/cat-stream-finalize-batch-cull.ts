import "server-only";

import { z } from "zod";
import type { JobKindDefinition } from "../types";

const payloadSchema = z.object({
  sessionId: z.string().uuid(),
  seq: z.number().int().nonnegative(),
  catId: z.string().min(1),
  verdictAt: z.number().int().positive(),
});

const definition: JobKindDefinition<z.infer<typeof payloadSchema>> = {
  kind: "cat-stream.finalize-batch-cull",
  payloadSchema,
  maxAttempts: 3,
  leaseMs: 30_000,
  handler: async (payload, context) => {
    const { finalizeBatchCull } = await import("../../services/catStream");
    return finalizeBatchCull(context.db, payload);
  },
};

export default definition;
