import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/** One room per streamer. Canvas state lives in tldraw's own SQLite tables. */
export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(),
  ownerClerkId: text("owner_clerk_id").notNull().unique(),
  twitchChannel: text("twitch_channel"),
  /** Long-lived secret stored server-side only. Used to mint short-lived OBS tokens. */
  obsSecret: text("obs_secret").notNull(),
  /** JSON array of Clerk user IDs allowed to edit this canvas. */
  allowedUsers: text("allowed_users", { mode: "json" }).$type<string[]>(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
});

/** Metadata for files uploaded to this service. Actual files stored on disk. */
export const uploads = sqliteTable("uploads", {
  id: text("id").primaryKey(),
  roomId: text("room_id")
    .notNull()
    .references(() => rooms.id),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  path: text("path").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }),
});
