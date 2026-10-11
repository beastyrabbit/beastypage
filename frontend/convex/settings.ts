import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import { randomSlug } from "./utils.js";

export type SettingsTable =
  | "dash_settings"
  | "palette_generator_settings"
  | "pixelator_settings"
  | "single_cat_settings";

export interface SettingsSaveArgs {
  config: unknown;
  slug?: string;
  editToken?: string;
}

export const settingsArgs = {
  config: v.any(),
  slug: v.optional(v.string()),
  editToken: v.optional(v.string()),
};

export const settingsSlugArgs = { slug: v.string() };

// Omit visually ambiguous characters from public settings URLs.
const SLUG_ALPHABET =
  "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const SLUG_LENGTH = 7;
const MAX_CONFIG_BYTES = 256 * 1024;
const UNIQUE_SLUG_ERRORS: Record<SettingsTable, string> = {
  dash_settings: "Failed to generate unique dash settings slug",
  palette_generator_settings: "Failed to generate unique settings slug",
  pixelator_settings: "Failed to generate unique settings slug",
  single_cat_settings: "Failed to generate unique settings slug",
};

function assertConfigSize(config: unknown) {
  let encoded: string;
  try {
    encoded = JSON.stringify(config);
  } catch {
    throw new Error("Invalid settings payload");
  }
  if (new TextEncoder().encode(encoded).byteLength > MAX_CONFIG_BYTES) {
    throw new Error("Settings payload is too large");
  }
}

async function generateUniqueSlug(ctx: MutationCtx, table: SettingsTable) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = randomSlug(SLUG_LENGTH, SLUG_ALPHABET);
    const existing = await ctx.db
      .query(table)
      .withIndex("bySlug", (q) => q.eq("slug", candidate))
      .unique();
    if (!existing) return candidate;
  }
  throw new Error(UNIQUE_SLUG_ERRORS[table]);
}

export async function saveSettings(
  ctx: MutationCtx,
  table: SettingsTable,
  args: SettingsSaveArgs,
): Promise<{
  slug: string;
  id: string;
  updated: boolean;
  editToken?: string;
}> {
  assertConfigSize(args.config);
  const now = Date.now();
  const trimmed = args.slug?.trim();

  if (trimmed && !/^[A-Za-z0-9]{1,20}$/.test(trimmed)) {
    throw new Error("Invalid slug format");
  }
  if (trimmed) {
    const existing = await ctx.db
      .query(table)
      .withIndex("bySlug", (q) => q.eq("slug", trimmed))
      .first();
    if (existing) {
      const identity = await ctx.auth.getUserIdentity();
      const owned =
        !!existing.ownerTokenIdentifier &&
        identity?.tokenIdentifier === existing.ownerTokenIdentifier;
      if (
        !owned &&
        (!existing.editToken || args.editToken !== existing.editToken)
      ) {
        throw new Error("Not authorized to edit settings");
      }
      await ctx.db.patch(existing._id, {
        config: args.config,
        updatedAt: now,
      });
      return {
        slug: existing.slug,
        id: existing._id,
        updated: true,
        editToken: existing.editToken,
      };
    }
  }

  const slug = trimmed || (await generateUniqueSlug(ctx, table));
  const editToken = crypto.randomUUID();
  const identity = await ctx.auth.getUserIdentity();
  const id = await ctx.db.insert(table, {
    slug,
    config: args.config,
    editToken,
    ...(identity?.tokenIdentifier
      ? { ownerTokenIdentifier: identity.tokenIdentifier }
      : {}),
    createdAt: now,
    updatedAt: now,
  });

  return { slug, id, updated: false, editToken };
}

export async function getSettings(
  ctx: QueryCtx,
  table: SettingsTable,
  slug: string,
) {
  const record = await ctx.db
    .query(table)
    .withIndex("bySlug", (q) => q.eq("slug", slug))
    .unique();
  if (!record) return null;
  return {
    slug: record.slug,
    config: record.config,
    id: record._id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
