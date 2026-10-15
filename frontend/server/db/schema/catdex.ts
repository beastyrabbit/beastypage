import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdUpdated, legacyColumns, primaryId, tstz } from "./columns";
import { files } from "./system";

const fileRef = (name: string) =>
  uuid(name).references(() => files.id, { onDelete: "restrict" });

export const cardSeason = pgTable(
  "card_season",
  {
    id: primaryId(),
    ...legacyColumns(),
    seasonName: text("season_name").notNull(),
    shortName: text("short_name"),
    cardBackFileId: fileRef("card_back_file_id"),
    cardBackName: text("card_back_name"),
    cardBackWidth: integer("card_back_width"),
    cardBackHeight: integer("card_back_height"),
    ...createdUpdated(),
  },
  (t) => [
    index("card_season_name_idx").on(t.seasonName),
    index("card_season_short_idx").on(t.shortName),
    index("card_season_created_idx").on(t.createdAt),
  ],
);

export const rarity = pgTable(
  "rarity",
  {
    id: primaryId(),
    ...legacyColumns(),
    rarityName: text("rarity_name").notNull(),
    stars: integer("stars"),
    chancePercent: doublePrecision("chance_percent"),
    ...createdUpdated(),
  },
  (t) => [index("rarity_name_idx").on(t.rarityName)],
);

export const thumbnailStatuses = [
  "pending",
  "processing",
  "complete",
  "failed",
] as const;

export const catdex = pgTable(
  "catdex",
  {
    id: primaryId(),
    ...legacyColumns(),
    twitchUserName: text("twitch_user_name").notNull(),
    catName: text("cat_name").notNull(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => cardSeason.id, { onDelete: "restrict" }),
    rarityId: uuid("rarity_id")
      .notNull()
      .references(() => rarity.id, { onDelete: "restrict" }),
    cardNumber: text("card_number"),
    approved: boolean("approved").notNull(),
    defaultCardFileId: fileRef("default_card_file_id"),
    defaultCardName: text("default_card_name"),
    defaultCardWidth: integer("default_card_width"),
    defaultCardHeight: integer("default_card_height"),
    defaultCardThumbFileId: fileRef("default_card_thumb_file_id"),
    defaultCardThumbName: text("default_card_thumb_name"),
    defaultCardThumbWidth: integer("default_card_thumb_width"),
    defaultCardThumbHeight: integer("default_card_thumb_height"),
    customCardFileId: fileRef("custom_card_file_id"),
    customCardName: text("custom_card_name"),
    customCardWidth: integer("custom_card_width"),
    customCardHeight: integer("custom_card_height"),
    customCardThumbFileId: fileRef("custom_card_thumb_file_id"),
    customCardThumbName: text("custom_card_thumb_name"),
    customCardThumbWidth: integer("custom_card_thumb_width"),
    customCardThumbHeight: integer("custom_card_thumb_height"),
    thumbnailStatus: text("thumbnail_status", { enum: thumbnailStatuses }),
    thumbnailAttemptedAt: tstz("thumbnail_attempted_at"),
    thumbnailAttemptCount: integer("thumbnail_attempt_count"),
    ...createdUpdated(),
  },
  (t) => [
    index("catdex_season_idx").on(t.seasonId),
    index("catdex_rarity_idx").on(t.rarityId),
    index("catdex_approved_idx").on(t.approved),
    index("catdex_owner_idx").on(t.twitchUserName),
    index("catdex_thumbnail_idx").on(t.thumbnailStatus, t.thumbnailAttemptedAt),
    index("catdex_created_idx").on(t.createdAt, t.id),
  ],
);

/** Short-lived upload capabilities; rows past `expires_at` are not imported. */
export const catdexUploads = pgTable(
  "catdex_uploads",
  {
    id: primaryId(),
    ...legacyColumns(),
    token: text("token").notNull(),
    rateKey: text("rate_key"),
    fileId: fileRef("file_id"),
    status: text("status", {
      enum: ["pending", "attached", "consumed"],
    }).notNull(),
    expiresAt: tstz("expires_at").notNull(),
    ...createdUpdated(),
  },
  (t) => [
    uniqueIndex("catdex_uploads_token_key").on(t.token),
    index("catdex_uploads_file_idx").on(t.fileId),
    index("catdex_uploads_created_idx").on(t.createdAt),
    index("catdex_uploads_rate_idx").on(t.rateKey, t.createdAt),
    index("catdex_uploads_expires_idx").on(t.expiresAt),
  ],
);

export const collection = pgTable(
  "collection",
  {
    id: primaryId(),
    ...legacyColumns(),
    artistName: text("artist_name").notNull(),
    animal: text("animal").notNull(),
    link: text("link").notNull(),
    blurImgFileId: fileRef("blur_img_file_id"),
    blurImgName: text("blur_img_name"),
    previewImgFileId: fileRef("preview_img_file_id"),
    previewImgName: text("preview_img_name"),
    fullImgFileId: fileRef("full_img_file_id"),
    fullImgName: text("full_img_name"),
    previewImgWidth: integer("preview_img_width"),
    previewImgHeight: integer("preview_img_height"),
    fullImgWidth: integer("full_img_width"),
    fullImgHeight: integer("full_img_height"),
    focusX: doublePrecision("focus_x"),
    focusY: doublePrecision("focus_y"),
    ...createdUpdated(),
  },
  (t) => [
    index("collection_artist_idx").on(t.artistName),
    index("collection_created_idx").on(t.createdAt),
  ],
);
