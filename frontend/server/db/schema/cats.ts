import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  AdoptionBatchSettings,
  AncestryCat,
  AncestryTreeConfig,
  CatData,
  CatShareData,
  JsonValue,
} from "../contracts";
import { createdUpdated, legacyColumns, primaryId, tstz } from "./columns";
import { files } from "./system";

export const adoptionBatch = pgTable(
  "adoption_batch",
  {
    id: primaryId(),
    ...legacyColumns(),
    editToken: text("edit_token"),
    ownerTokenIdentifier: text("owner_token_identifier"),
    slug: text("slug"),
    title: text("title"),
    creatorName: text("creator_name"),
    settings: jsonb("settings").$type<AdoptionBatchSettings>(),
    ...createdUpdated(),
  },
  (t) => [
    uniqueIndex("adoption_batch_slug_key").on(t.slug),
    index("adoption_batch_created_idx").on(t.createdAt),
    index("adoption_batch_owner_idx").on(t.ownerTokenIdentifier, t.createdAt),
  ],
);

export const catProfile = pgTable(
  "cat_profile",
  {
    id: primaryId(),
    ...legacyColumns(),
    slug: text("slug").notNull(),
    catData: jsonb("cat_data").$type<CatData>().notNull(),
    catName: text("cat_name"),
    creatorName: text("creator_name"),
    ownerTokenIdentifier: text("owner_token_identifier"),
    editToken: text("edit_token"),
    adoptionBatchId: uuid("adoption_batch_id").references(
      () => adoptionBatch.id,
      {
        onDelete: "set null",
      },
    ),
    previewsUpdatedAt: tstz("previews_updated_at"),
    ...createdUpdated(),
  },
  (t) => [
    uniqueIndex("cat_profile_slug_key").on(t.slug),
    index("cat_profile_created_idx").on(t.createdAt),
    index("cat_profile_batch_idx").on(t.adoptionBatchId),
  ],
);

/**
 * `adoption_batch.cats[]` normalized: each element may reference a
 * cat_profile, which needs a real foreign key. `position` keeps the order.
 */
export const adoptionBatchCats = pgTable(
  "adoption_batch_cats",
  {
    id: primaryId(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => adoptionBatch.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    label: text("label").notNull(),
    catData: jsonb("cat_data").$type<CatData>().notNull(),
    profileId: uuid("profile_id").references(() => catProfile.id, {
      onDelete: "set null",
    }),
    encoded: text("encoded"),
    shareToken: text("share_token"),
    editToken: text("edit_token"),
    catName: text("cat_name"),
    creatorName: text("creator_name"),
  },
  (t) => [
    uniqueIndex("adoption_batch_cats_position_key").on(t.batchId, t.position),
    index("adoption_batch_cats_profile_idx").on(t.profileId),
    check("adoption_batch_cats_position_nonnegative", sql`${t.position} >= 0`),
  ],
);

export const catImages = pgTable(
  "cat_images",
  {
    id: primaryId(),
    ...legacyColumns(),
    catProfileId: uuid("cat_profile_id")
      .notNull()
      .references(() => catProfile.id, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: ["tiny", "preview", "full", "spriteSheet"],
    }).notNull(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "restrict" }),
    filename: text("filename"),
    meta: jsonb("meta").$type<JsonValue>(),
    width: integer("width"),
    height: integer("height"),
    ...createdUpdated(),
  },
  (t) => [
    index("cat_images_profile_idx").on(t.catProfileId),
    index("cat_images_profile_kind_idx").on(t.catProfileId, t.kind),
  ],
);

export const catShares = pgTable(
  "cat_shares",
  {
    id: primaryId(),
    ...legacyColumns(),
    slug: text("slug").notNull(),
    data: jsonb("data").$type<CatShareData>().notNull(),
    editToken: text("edit_token"),
    ownerTokenIdentifier: text("owner_token_identifier"),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("cat_shares_slug_key").on(t.slug),
    index("cat_shares_created_idx").on(t.createdAt),
  ],
);

/**
 * Ancestry trees are read and written as one document; `cats[]` holds
 * tree-local string ids (not Convex ids), so it stays typed JSONB.
 */
export const ancestryTree = pgTable(
  "ancestry_tree",
  {
    id: primaryId(),
    ...legacyColumns(),
    slug: text("slug").notNull(),
    editToken: text("edit_token"),
    ownerTokenIdentifier: text("owner_token_identifier"),
    name: text("name").notNull(),
    foundingMotherId: text("founding_mother_id").notNull(),
    foundingFatherId: text("founding_father_id").notNull(),
    cats: jsonb("cats").$type<AncestryCat[]>().notNull(),
    config: jsonb("config").$type<AncestryTreeConfig>().notNull(),
    creatorName: text("creator_name"),
    passwordHash: text("password_hash"),
    ...createdUpdated(),
  },
  (t) => [
    uniqueIndex("ancestry_tree_slug_key").on(t.slug),
    index("ancestry_tree_created_idx").on(t.createdAt),
  ],
);
