import "server-only";

import { z } from "zod";
import { cleanupPerfectMatchups } from "../../services/games";
import type { JobKindDefinition } from "../types";

const payloadSchema = z.object({});

const perfectMatchupRetention: JobKindDefinition<
  z.infer<typeof payloadSchema>
> = {
  kind: "perfect-matchup.retention",
  payloadSchema,
  maxAttempts: 5,
  leaseMs: 5 * 60_000,
  recurringIntervalMs: 60 * 60_000,
  recurringDedupeKey: "singleton",
  recurringPayload: {},
  async handler(_payload, { db }) {
    return cleanupPerfectMatchups(db);
  },
};

export default perfectMatchupRetention;
