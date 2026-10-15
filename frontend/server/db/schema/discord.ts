import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createdUpdated, legacyColumns, primaryId, tstz } from "./columns";

/** Short-lived invite challenges; only unexpired rows are imported. */
export const discordChallenge = pgTable(
  "discord_challenge",
  {
    id: primaryId(),
    ...legacyColumns(),
    token: text("token").notNull(),
    answerHash: text("answer_hash").notNull(),
    salt: text("salt").notNull(),
    expiresAt: tstz("expires_at").notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
    usedAt: tstz("used_at"),
  },
  (t) => [
    uniqueIndex("discord_challenge_token_key").on(t.token),
    index("discord_challenge_expires_idx").on(t.expiresAt),
  ],
);

export const discordUserConfigs = pgTable(
  "discord_user_configs",
  {
    id: primaryId(),
    ...legacyColumns(),
    discordUserId: text("discord_user_id").notNull(),
    accessoriesMin: integer("accessories_min").notNull(),
    accessoriesMax: integer("accessories_max").notNull(),
    scarsMin: integer("scars_min").notNull(),
    scarsMax: integer("scars_max").notNull(),
    tortiesMin: integer("torties_min").notNull(),
    tortiesMax: integer("torties_max").notNull(),
    darkForest: boolean("dark_forest").notNull(),
    starclan: boolean("starclan").notNull(),
    palettes: text("palettes").array().notNull(),
    ...createdUpdated(),
  },
  (t) => [
    uniqueIndex("discord_user_configs_discord_user_key").on(t.discordUserId),
  ],
);
