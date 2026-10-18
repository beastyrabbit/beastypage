import "server-only";

import { sql } from "drizzle-orm";
import { z } from "zod";
import type { JobKindDefinition } from "../types";

const payloadSchema = z.object({});
const discordChallengePrune: JobKindDefinition<z.infer<typeof payloadSchema>> =
  {
    kind: "discord.challenge-prune",
    payloadSchema,
    maxAttempts: 5,
    leaseMs: 5 * 60_000,
    recurringIntervalMs: 5 * 60_000,
    recurringDedupeKey: "singleton",
    recurringPayload: {},
    async handler(_payload, { db }) {
      const result = await db.execute(
        sql`delete from discord_challenge where expires_at <= now()`,
      );
      return { deleted: result.rowCount ?? 0 };
    },
  };

export default discordChallengePrune;
