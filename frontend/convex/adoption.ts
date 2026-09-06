// Temporary legacy mutations; no capability projection or profile association writes.
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel.js";
import type { MutationCtx } from "./_generated/server.js";
import { mutation } from "./_generated/server.js";
import { batchRecordToClient } from "./adoptionV2.js";
import { docIdToString } from "./utils.js";

const SLUG_ALPHABET =
  "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const SLUG_LENGTH = 9;

type AdoptionBatchDoc = Doc<"adoption_batch">;
type AdoptionBatchInsert = Omit<AdoptionBatchDoc, "_id" | "_creationTime">;

type GenerateCtx = MutationCtx;

function randomSlug(): string {
  let slug = "";
  for (let i = 0; i < SLUG_LENGTH; i += 1) {
    const index = Math.floor(Math.random() * SLUG_ALPHABET.length);
    slug += SLUG_ALPHABET[index];
  }
  return slug;
}

async function generateUniqueSlug(ctx: GenerateCtx): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = randomSlug();
    const existing = await ctx.db
      .query("adoption_batch")
      .withIndex("bySlug", (q) => q.eq("slug", candidate))
      .first();
    if (!existing) {
      return candidate;
    }
  }
  throw new Error("Failed to generate unique slug after several attempts");
}

function sanitizeOptionalString(value: string | undefined | null) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 80);
}

export const createBatch = mutation({
  args: {
    cats: v.array(
      v.object({
        label: v.string(),
        catData: v.any(),
        profileId: v.optional(v.id("cat_profile")),
        encoded: v.optional(v.string()),
        shareToken: v.optional(v.string()),
        editToken: v.optional(v.string()),
        catName: v.optional(v.string()),
        creatorName: v.optional(v.string()),
      }),
    ),
    title: v.optional(v.string()),
    creatorName: v.optional(v.string()),
    settings: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    if (!args.cats.length) {
      throw new Error(
        "At least one cat is required to create an adoption batch",
      );
    }

    const now = Date.now();
    const slug = await generateUniqueSlug(ctx);

    const cats = args.cats.map((cat) => {
      const entry: AdoptionBatchDoc["cats"][number] = {
        label: cat.label,
        catData: cat.catData,
      };

      if (cat.profileId) {
        entry.profileId = cat.profileId;
      }

      const encoded = typeof cat.encoded === "string" ? cat.encoded.trim() : "";
      if (encoded) entry.encoded = encoded;

      const shareToken =
        typeof cat.shareToken === "string" ? cat.shareToken.trim() : "";
      if (shareToken) entry.shareToken = shareToken;

      const editToken =
        typeof cat.editToken === "string" ? cat.editToken.trim() : "";
      if (editToken) entry.editToken = editToken;

      const catName = sanitizeOptionalString(cat.catName);
      if (catName) entry.catName = catName;

      const creatorName = sanitizeOptionalString(cat.creatorName);
      if (creatorName) entry.creatorName = creatorName;

      return entry;
    });

    const base: AdoptionBatchInsert = {
      slug,
      cats,
      createdAt: now,
      updatedAt: now,
    };

    const title = sanitizeOptionalString(args.title);
    if (title) base.title = title;

    const creatorName = sanitizeOptionalString(args.creatorName);
    if (creatorName) base.creatorName = creatorName;

    if (args.settings !== undefined) {
      base.settings = args.settings;
    }

    const id = await ctx.db.insert("adoption_batch", base);

    // Legacy clients lack profile edit authority; keep previews without modifying profiles.

    return { id: docIdToString(id), slug, shareToken: slug };
  },
});

export { getBySlug, listBatches } from "./adoptionV2.js";

export const updateBatchMeta = mutation({
  args: {
    id: v.id("adoption_batch"),
    title: v.optional(v.string()),
    creatorName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) {
      throw new Error("Adoption batch not found");
    }

    if (doc.editToken || doc.ownerTokenIdentifier)
      throw new Error("Reload to edit this batch");
    const title = sanitizeOptionalString(args.title ?? null);
    const creator = sanitizeOptionalString(args.creatorName ?? null);

    await ctx.db.patch(args.id, {
      updatedAt: Date.now(),
      title: title ?? undefined,
      creatorName: creator ?? undefined,
    } as Partial<AdoptionBatchDoc>);
    const updated = await ctx.db.get(args.id);
    return updated ? await batchRecordToClient(ctx, updated) : null;
  },
});
