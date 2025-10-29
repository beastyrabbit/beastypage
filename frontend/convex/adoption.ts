import { mutation, query } from "./_generated/server.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel.js";
import { docIdToString, toId, normalizeStorageUrl } from "./utils.js";
import type { Id } from "./_generated/dataModel.js";

const SLUG_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
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
        catName: v.optional(v.string()),
        creatorName: v.optional(v.string()),
      })
    ),
    title: v.optional(v.string()),
    creatorName: v.optional(v.string()),
    settings: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    if (!args.cats.length) {
      throw new Error("At least one cat is required to create an adoption batch");
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

      const shareToken = typeof cat.shareToken === "string" ? cat.shareToken.trim() : "";
      if (shareToken) entry.shareToken = shareToken;

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

    await Promise.all(
      cats
        .map((cat) => cat.profileId)
        .filter((profileId): profileId is Id<"cat_profile"> => Boolean(profileId))
        .map((profileId) =>
          ctx.db.patch(profileId, { adoptionBatchId: id, updatedAt: now })
        )
    );

    return { id: docIdToString(id), slug, shareToken: slug };
  },
});

export const getBySlug = query({
  args: {
    slugOrId: v.string(),
  },
  handler: async (ctx, args) => {
    const bySlug = await ctx.db
      .query("adoption_batch")
      .withIndex("bySlug", (q) => q.eq("slug", args.slugOrId))
      .unique();
    if (bySlug) {
      return batchRecordToClient(ctx, bySlug);
    }

    try {
      const asId = await ctx.db.get(toId("adoption_batch", args.slugOrId));
      return asId ? await batchRecordToClient(ctx, asId) : null;
    } catch (error) {
      return null;
    }
  },
});

export const listBatches = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit && args.limit > 0 ? Math.min(args.limit, 200) : 50;
    const docs = await ctx.db
      .query("adoption_batch")
      .withIndex("byCreated")
      .order("desc")
      .take(limit);
    return Promise.all(docs.map((doc) => batchRecordToClient(ctx, doc)));
  },
});

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

    const title = sanitizeOptionalString(args.title ?? null);
    const creator = sanitizeOptionalString(args.creatorName ?? null);

    await ctx.db.patch(
      args.id,
      {
        updatedAt: Date.now(),
        title: title ?? undefined,
        creatorName: creator ?? undefined,
      } as Partial<AdoptionBatchDoc>
    );
    const updated = await ctx.db.get(args.id);
    return updated ? await batchRecordToClient(ctx, updated) : null;
  },
});

async function batchRecordToClient(ctx: QueryCtx | MutationCtx, doc: AdoptionBatchDoc) {
  return {
    id: docIdToString(doc._id),
    slug: doc.slug ?? docIdToString(doc._id),
    title: doc.title ?? null,
    creatorName: doc.creatorName ?? null,
    settings: doc.settings ?? null,
    cats: await Promise.all(
      (doc.cats ?? []).map(async (cat, index) => {
      const profileInfo = cat.profileId ? await resolveProfilePreview(ctx, cat.profileId) : null;
      return {
        index,
        label: cat.label,
        catData: cat.catData,
        profileId: cat.profileId ? docIdToString(cat.profileId) : profileInfo?.id ?? null,
        encoded: cat.encoded ?? null,
        shareToken: cat.shareToken ?? profileInfo?.slug ?? null,
        catName: cat.catName ?? profileInfo?.catName ?? null,
        creatorName: cat.creatorName ?? profileInfo?.creatorName ?? null,
        previews: profileInfo?.previews ?? { tiny: null, preview: null, full: null, spriteSheet: null, updatedAt: null },
      };
      })
    ),
    created: doc.createdAt,
    updated: doc.updatedAt,
  };
}

async function resolveProfilePreview(ctx: QueryCtx | MutationCtx, profileId: Id<"cat_profile">) {
  const profile = await ctx.db.get(profileId);
  if (!profile) return null;

  const images = await ctx.db
    .query("cat_images")
    .withIndex("byProfile", (q) => q.eq("catProfileId", profileId))
    .collect();

  const find = (kind: "tiny" | "preview" | "full" | "spriteSheet") =>
    images.find((image) => image.kind === kind) ?? null;

  const tinyImage = find("tiny");
  const previewImage = find("preview");
  const fullImage = find("full");
  const sheetImage = find("spriteSheet");

  const tinyUrl = tinyImage ? await safeGetUrl(ctx, tinyImage.storageId) : null;
  const previewUrl = previewImage ? await safeGetUrl(ctx, previewImage.storageId) : null;
  const fullUrl = fullImage ? await safeGetUrl(ctx, fullImage.storageId) : null;
  const sheetUrl = sheetImage ? await safeGetUrl(ctx, sheetImage.storageId) : null;

  return {
    id: docIdToString(profile._id),
    slug: profile.slug,
    catName: profile.catName ?? null,
    creatorName: profile.creatorName ?? null,
    previews: {
      tiny: tinyUrl ? { url: tinyUrl, name: tinyImage?.filename ?? null } : null,
      preview: previewUrl ? { url: previewUrl, name: previewImage?.filename ?? null } : null,
      full: fullUrl ? { url: fullUrl, name: fullImage?.filename ?? null } : null,
      spriteSheet: sheetUrl
        ? {
            url: sheetUrl,
            name: sheetImage?.filename ?? null,
            meta: sheetImage?.meta ?? null,
          }
        : null,
      updatedAt: profile.previewsUpdatedAt ?? null,
    },
  };
}

async function safeGetUrl(ctx: QueryCtx | MutationCtx, id: Id<"_storage">): Promise<string | null> {
  try {
    const url = await ctx.storage.getUrl(id);
    return normalizeStorageUrl(url);
  } catch (error) {
    console.warn("Failed to obtain storage URL", error);
    return null;
  }
}
