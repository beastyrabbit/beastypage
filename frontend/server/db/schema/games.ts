import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { PerfectCatParams } from "../contracts";
import { createdUpdated, legacyColumns, primaryId, tstz } from "./columns";

export const coinflipperScores = pgTable(
  "coinflipper_scores",
  {
    id: primaryId(),
    ...legacyColumns(),
    playerName: text("player_name").notNull(),
    score: integer("score").notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("coinflipper_scores_score_idx").on(t.score, t.createdAt),
    index("coinflipper_scores_created_idx").on(t.createdAt),
  ],
);

export const perfectCats = pgTable(
  "perfect_cats",
  {
    id: primaryId(),
    ...legacyColumns(),
    hash: text("hash").notNull(),
    params: jsonb("params").$type<PerfectCatParams>().notNull(),
    rating: doublePrecision("rating").notNull(),
    wins: integer("wins").notNull(),
    losses: integer("losses").notNull(),
    appearances: integer("appearances").notNull(),
    lastShownAt: tstz("last_shown_at"),
    ...createdUpdated(),
  },
  (t) => [
    uniqueIndex("perfect_cats_hash_key").on(t.hash),
    index("perfect_cats_rating_idx").on(t.rating, t.createdAt),
    index("perfect_cats_updated_idx").on(t.updatedAt),
  ],
);

const perfectCatRef = (name: string, onDelete: "restrict" | "cascade") =>
  uuid(name)
    .notNull()
    .references(() => perfectCats.id, { onDelete });

/** Vote history; perfect cats are never deleted, so references restrict. */
export const perfectVotes = pgTable(
  "perfect_votes",
  {
    id: primaryId(),
    ...legacyColumns(),
    catAId: perfectCatRef("cat_a_id", "restrict"),
    catBId: perfectCatRef("cat_b_id", "restrict"),
    winnerId: perfectCatRef("winner_id", "restrict"),
    clientId: text("client_id"),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("perfect_votes_client_idx").on(t.clientId, t.createdAt),
    index("perfect_votes_cats_idx").on(t.catAId, t.catBId, t.createdAt),
  ],
);

/** One-time vote capabilities; only unexpired rows are imported. */
export const perfectMatchups = pgTable(
  "perfect_matchups",
  {
    id: primaryId(),
    ...legacyColumns(),
    clientId: text("client_id").notNull(),
    catAId: perfectCatRef("cat_a_id", "cascade"),
    catBId: perfectCatRef("cat_b_id", "cascade"),
    token: text("token").notNull(),
    expiresAt: tstz("expires_at").notNull(),
    consumed: boolean("consumed").notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("perfect_matchups_client_idx").on(t.clientId),
    index("perfect_matchups_expires_idx").on(t.expiresAt),
    index("perfect_matchups_consumed_expires_idx").on(t.consumed, t.expiresAt),
  ],
);
