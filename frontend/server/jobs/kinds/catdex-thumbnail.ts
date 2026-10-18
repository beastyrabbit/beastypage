import "server-only";

import { z } from "zod";
import type { JobKindDefinition } from "../types";

const payloadSchema = z.object({
  id: z.string().uuid(),
  attempt: z.number().int().positive(),
});

const catdexThumbnail: JobKindDefinition<z.infer<typeof payloadSchema>> = {
  kind: "catdex.thumbnail",
  payloadSchema,
  maxAttempts: 3,
  leaseMs: 5 * 60_000,
  async handler(payload, { db }) {
    const { generateCatdexThumbnail } = await import("../../services/catalog");
    const result = await generateCatdexThumbnail(
      db,
      payload.id,
      payload.attempt,
    );
    return {
      generated:
        result.success &&
        "generated" in result &&
        Array.isArray(result.generated)
          ? result.generated.length
          : 0,
      stale: result.success ? 0 : 1,
    };
  },
};

export default catdexThumbnail;
