import "server-only";

import { z } from "zod";
import type { JobKindDefinition } from "../types";

const payloadSchema = z.object({});

const catdexThumbnailBackfill: JobKindDefinition<
  z.infer<typeof payloadSchema>
> = {
  kind: "catdex.thumbnail-backfill",
  payloadSchema,
  maxAttempts: 5,
  leaseMs: 5 * 60_000,
  recurringIntervalMs: 6 * 60 * 60_000,
  recurringDedupeKey: "singleton",
  recurringPayload: {},
  async handler(_payload, { db }) {
    const { enqueueMissingCatdexThumbnails } = await import(
      "../../services/catalog"
    );
    return enqueueMissingCatdexThumbnails(db, 25);
  },
};

export default catdexThumbnailBackfill;
