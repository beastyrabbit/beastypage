import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  DashConfig,
  PaletteGeneratorConfig,
  PixelatorConfig,
  SingleCatConfig,
  UserVariantSettings,
} from "../contracts";
import { createdUpdated, legacyColumns, primaryId } from "./columns";
import { files } from "./system";
import { users } from "./users";

/** The four "shareable settings by slug" tables share one shape. */
function slugSettingsTable<TConfig>(name: string) {
  return pgTable(
    name,
    {
      id: primaryId(),
      ...legacyColumns(),
      slug: text("slug").notNull(),
      config: jsonb("config").$type<TConfig>().notNull(),
      editToken: text("edit_token"),
      ownerTokenIdentifier: text("owner_token_identifier"),
      ...createdUpdated(),
    },
    (t) => [
      uniqueIndex(`${name}_slug_key`).on(t.slug),
      index(`${name}_created_idx`).on(t.createdAt),
    ],
  );
}

export const singleCatSettings = slugSettingsTable<SingleCatConfig>(
  "single_cat_settings",
);
export const pixelatorSettings =
  slugSettingsTable<PixelatorConfig>("pixelator_settings");
export const dashSettings = slugSettingsTable<DashConfig>("dash_settings");

/**
 * Palette settings carried a Convex storage id inside `config`
 * (`imageStorageId`). It becomes a real column; the importer moves it out of
 * the JSON and rewrites it to a file id.
 */
export const paletteGeneratorSettings = pgTable(
  "palette_generator_settings",
  {
    id: primaryId(),
    ...legacyColumns(),
    slug: text("slug").notNull(),
    config: jsonb("config").$type<PaletteGeneratorConfig>().notNull(),
    imageFileId: uuid("image_file_id").references(() => files.id, {
      onDelete: "restrict",
    }),
    editToken: text("edit_token"),
    ownerTokenIdentifier: text("owner_token_identifier"),
    ...createdUpdated(),
  },
  (t) => [
    uniqueIndex("palette_generator_settings_slug_key").on(t.slug),
    index("palette_generator_settings_created_idx").on(t.createdAt),
  ],
);

export const userVariants = pgTable(
  "user_variants",
  {
    id: primaryId(),
    ...legacyColumns(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    toolKey: text("tool_key").notNull(),
    variantId: text("variant_id").notNull(),
    name: text("name").notNull(),
    slug: text("slug"),
    settings: jsonb("settings").$type<UserVariantSettings>().notNull(),
    isActive: boolean("is_active").notNull(),
    ...createdUpdated(),
  },
  (t) => [
    index("user_variants_user_tool_idx").on(t.userId, t.toolKey),
    uniqueIndex("user_variants_user_variant_key").on(
      t.userId,
      t.toolKey,
      t.variantId,
    ),
  ],
);
