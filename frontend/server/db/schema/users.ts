import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createdUpdated, legacyColumns, primaryId } from "./columns";

/**
 * `token_identifier` keeps the PostgreSQL/Clerk format `<issuer>|<subject>` so
 * owner columns and admin allowlists carry over unchanged (ADR §9).
 */
export const users = pgTable(
  "users",
  {
    id: primaryId(),
    ...legacyColumns(),
    tokenIdentifier: text("token_identifier").notNull(),
    username: text("username"),
    // Usernames are ASCII [A-Za-z0-9_-], so lower() matches JS toLowerCase().
    // Generated, which retires the PostgreSQL username-search backfill cron.
    usernameSearch: text("username_search").generatedAlwaysAs(
      sql`nullif(lower(btrim(username)), '')`,
    ),
    showProfilePic: boolean("show_profile_pic").notNull(),
    apiKey: text("api_key"),
    ...createdUpdated(),
  },
  (t) => [
    uniqueIndex("users_token_identifier_key").on(t.tokenIdentifier),
    uniqueIndex("users_username_key").on(t.username),
    index("users_username_search_idx").on(
      sql`${t.usernameSearch} text_pattern_ops`,
    ),
    uniqueIndex("users_api_key_key").on(t.apiKey),
    check(
      "users_username_format",
      sql`${t.username} ~ '^[A-Za-z0-9_-]{1,30}$'`,
    ),
  ],
);
