import "server-only";

import { z } from "zod";
import type { JobKindDefinition } from "../types";

const payloadSchema = z.object({});

const catdexUploadRetention: JobKindDefinition<z.infer<typeof payloadSchema>> =
  {
    kind: "catdex.upload-retention",
    payloadSchema,
    maxAttempts: 5,
    leaseMs: 5 * 60_000,
    recurringIntervalMs: 60 * 60_000,
    recurringDedupeKey: "singleton",
    recurringPayload: {},
    async handler(_payload, { db }) {
      const { cleanupExpiredCatdexUploads } = await import(
        "../../services/catalog"
      );
      return cleanupExpiredCatdexUploads(db, 100);
    },
  };

export default catdexUploadRetention;
