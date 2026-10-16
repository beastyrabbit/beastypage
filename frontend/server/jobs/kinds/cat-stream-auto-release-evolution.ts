import "server-only";

import { z } from "zod";
import type { JobKindDefinition } from "../types";

const payloadSchema = z.object({
  sessionId: z.string().uuid(),
  seq: z.number().int().nonnegative(),
  holdStartedAt: z.number().int().positive(),
});

const definition: JobKindDefinition<z.infer<typeof payloadSchema>> = {
  kind: "cat-stream.auto-release-evolution",
  payloadSchema,
  maxAttempts: 3,
  leaseMs: 30_000,
  handler: async (payload, context) => {
    const { autoReleaseEvolution } = await import("../../services/catStream");
    return autoReleaseEvolution(context.db, payload);
  },
};

export default definition;
