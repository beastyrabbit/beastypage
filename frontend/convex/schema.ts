import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  card_season: defineTable({
    seasonName: v.string(),
    shortName: v.optional(v.string()),
    cardBackStorageId: v.optional(v.id("_storage")),
    cardBackName: v.optional(v.string()),
    cardBackWidth: v.optional(v.number()),
    cardBackHeight: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("byName", ["seasonName"])
    .index("byShort", ["shortName"]),

  rarity: defineTable({
    rarityName: v.string(),
    stars: v.optional(v.number()),
    chancePercent: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number()
  }).index("byName", ["rarityName"]),

  catdex: defineTable({
    twitchUserName: v.string(),
    catName: v.string(),
    seasonId: v.id("card_season"),
    rarityId: v.id("rarity"),
    cardNumber: v.optional(v.string()),
    approved: v.boolean(),
    defaultCardStorageId: v.optional(v.id("_storage")),
    defaultCardName: v.optional(v.string()),
    defaultCardWidth: v.optional(v.number()),
    defaultCardHeight: v.optional(v.number()),
    defaultCardThumbName: v.optional(v.string()),
    defaultCardThumbStorageId: v.optional(v.id("_storage")),
    defaultCardThumbWidth: v.optional(v.number()),
    defaultCardThumbHeight: v.optional(v.number()),
    customCardStorageId: v.optional(v.id("_storage")),
    customCardName: v.optional(v.string()),
    customCardWidth: v.optional(v.number()),
    customCardHeight: v.optional(v.number()),
    customCardThumbName: v.optional(v.string()),
    customCardThumbStorageId: v.optional(v.id("_storage")),
    customCardThumbWidth: v.optional(v.number()),
    customCardThumbHeight: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("bySeason", ["seasonId"])
    .index("byRarity", ["rarityId"])
    .index("byApproval", ["approved"])
    .index("byOwner", ["twitchUserName"]),

  collection: defineTable({
    artistName: v.string(),
    animal: v.string(),
    link: v.string(),
    blurImgStorageId: v.optional(v.id("_storage")),
    blurImgName: v.optional(v.string()),
    previewImgStorageId: v.optional(v.id("_storage")),
    previewImgName: v.optional(v.string()),
    fullImgStorageId: v.optional(v.id("_storage")),
    fullImgName: v.optional(v.string()),
    previewImgWidth: v.optional(v.number()),
    previewImgHeight: v.optional(v.number()),
    fullImgWidth: v.optional(v.number()),
    fullImgHeight: v.optional(v.number()),
    focusX: v.optional(v.number()),
    focusY: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number()
  }).index("byArtist", ["artistName"]),

  coinflipper_scores: defineTable({
    playerName: v.string(),
    score: v.number(),
    createdAt: v.number()
  })
    .index("byScore", ["score", "createdAt"])
    .index("byCreated", ["createdAt"]),

  cat_profile: defineTable({
    slug: v.string(),
    catData: v.any(),
    catName: v.optional(v.string()),
    creatorName: v.optional(v.string()),
    adoptionBatchId: v.optional(v.id("adoption_batch")),
    previewsUpdatedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("bySlug", ["slug"])
    .index("byCreated", ["createdAt"]),

  cat_images: defineTable({
    catProfileId: v.id("cat_profile"),
    kind: v.union(
      v.literal("tiny"),
      v.literal("preview"),
      v.literal("full"),
      v.literal("spriteSheet")
    ),
    storageId: v.id("_storage"),
    filename: v.optional(v.string()),
    meta: v.optional(v.any()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("byProfile", ["catProfileId"])
    .index("byProfileKind", ["catProfileId", "kind"]),

  cat_shares: defineTable({
    slug: v.string(),
    data: v.any(),
    createdAt: v.number(),
  })
    .index("bySlug", ["slug"])
    .index("byCreated", ["createdAt"]),

  single_cat_settings: defineTable({
    slug: v.string(),
    config: v.any(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("bySlug", ["slug"])
    .index("byCreated", ["createdAt"]),

  adoption_batch: defineTable({
    slug: v.optional(v.string()),
    title: v.optional(v.string()),
    creatorName: v.optional(v.string()),
    settings: v.optional(v.any()),
    cats: v.array(
      v.object({
        label: v.string(),
        catData: v.any(),
        profileId: v.optional(v.id("cat_profile")),
        encoded: v.optional(v.string()),
        shareToken: v.optional(v.string()),
        catName: v.optional(v.string()),
        creatorName: v.optional(v.string())
      })
    ),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("bySlug", ["slug"])
    .index("byCreated", ["createdAt"]),

  stream_sessions: defineTable({
    viewerKey: v.string(),
    status: v.string(),
    currentStep: v.optional(v.string()),
    stepIndex: v.optional(v.number()),
    stepHistory: v.optional(v.any()),
    params: v.optional(v.any()),
    allowRepeatIps: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("byViewerKey", ["viewerKey"])
    .index("byStatus", ["status"]),

  stream_participants: defineTable({
    sessionId: v.id("stream_sessions"),
    viewerSession: v.optional(v.string()),
    displayName: v.string(),
    status: v.string(),
    fingerprint: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("bySession", ["sessionId"])
    .index("byViewerSession", ["viewerSession"]),

  stream_votes: defineTable({
    sessionId: v.id("stream_sessions"),
    stepId: v.string(),
    optionKey: v.string(),
    optionMeta: v.optional(v.any()),
    votedBy: v.optional(v.id("stream_participants")),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("bySession", ["sessionId"])
    .index("byStep", ["sessionId", "stepId"]),

  wheel_spins: defineTable({
    prizeName: v.string(),
    forced: v.boolean(),
    randomBucket: v.optional(v.number()),
    createdAt: v.number()
  })
    .index("byPrize", ["prizeName"])
    .index("byCreated", ["createdAt"]),

  discord_challenge: defineTable({
    token: v.string(),
    answerHash: v.string(),
    salt: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
    usedAt: v.optional(v.number())
  })
    .index("byToken", ["token"])
    .index("byExpiresAt", ["expiresAt"]),

  perfect_cats: defineTable({
    hash: v.string(),
    params: v.any(),
    rating: v.number(),
    wins: v.number(),
    losses: v.number(),
    appearances: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastShownAt: v.optional(v.number())
  })
    .index("byHash", ["hash"])
    .index("byRating", ["rating", "createdAt"])
    .index("byUpdated", ["updatedAt"]),

  perfect_votes: defineTable({
    catAId: v.id("perfect_cats"),
    catBId: v.id("perfect_cats"),
    winnerId: v.id("perfect_cats"),
    clientId: v.optional(v.string()),
    createdAt: v.number()
  })
    .index("byClient", ["clientId", "createdAt"])
    .index("byCats", ["catAId", "catBId", "createdAt"]),

  ancestry_tree: defineTable({
    slug: v.string(),
    name: v.string(),
    foundingMotherId: v.string(),
    foundingFatherId: v.string(),
    cats: v.array(v.object({
      id: v.string(),
      name: v.object({
        prefix: v.string(),
        suffix: v.string(),
        full: v.string()
      }),
      gender: v.union(v.literal("M"), v.literal("F")),
      lifeStage: v.string(),
      params: v.any(),
      motherId: v.union(v.string(), v.null()),
      fatherId: v.union(v.string(), v.null()),
      partnerIds: v.array(v.string()),
      childrenIds: v.array(v.string()),
      genetics: v.any(),
      source: v.string(),
      historyProfileId: v.optional(v.string()),
      generation: v.number()
    })),
    config: v.object({
      minChildren: v.number(),
      maxChildren: v.number(),
      depth: v.number(),
      genderRatio: v.number(),
      partnerChance: v.optional(v.number()),
      paletteModes: v.optional(v.array(v.string())),
      offspringOptions: v.optional(v.object({
        accessoryChance: v.number(),
        maxAccessories: v.number(),
        scarChance: v.number(),
        maxScars: v.number()
      }))
    }),
    creatorName: v.optional(v.string()),
    passwordHash: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("bySlug", ["slug"])
    .index("byCreated", ["createdAt"])
});
