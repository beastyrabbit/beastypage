#!/usr/bin/env bun
/**
 * Migration script: Self-hosted Convex -> Convex Cloud
 * 
 * This version uses Convex query functions for export (works with self-hosted)
 * instead of the streaming export API (Cloud-only feature).
 *
 * PREREQUISITES:
 * 1. Deploy migrationExport.ts to self-hosted Convex
 * 2. Deploy migrationImport.ts to Convex Cloud
 *
 * DEV MIGRATION (run from production server):
 *   SOURCE_URL=https://devdb.beastyrabbit.com \
 *   SOURCE_DEPLOY_KEY='convex-dev|017655a658f1ce26dccb362657058849bd8fc79657aeaa518b9a2abf5a24c14101add45182' \
 *   TARGET_URL=https://robust-porpoise-440.convex.cloud \
 *   TARGET_DEPLOY_KEY='dev:robust-porpoise-440|eyJ2MiI6IjU5ZTNjOWNlMmVkOTQxNjViYTQxMmExMTlkMDI5MjBkIn0=' \
 *   bun run scripts/migrate-to-cloud.ts
 *
 * PROD MIGRATION:
 *   SOURCE_URL=https://proddb.beastyrabbit.com \
 *   SOURCE_DEPLOY_KEY='convex-prod|011eb7b9826786bb290e27dfeb257cc89922007cde9b35a2516dd3eff689891a0c9339c8fc' \
 *   TARGET_URL=https://standing-crane-709.convex.cloud \
 *   TARGET_DEPLOY_KEY='prod:standing-crane-709|eyJ2MiI6IjNmOWRmZjc5MDlmMzRjM2M4MjEwMDAxZjQ5YWU3MjY2In0=' \
 *   bun run scripts/migrate-to-cloud.ts
 */

import { ConvexHttpClient } from "convex/browser";

// ============================================================================
// Configuration
// ============================================================================

const SOURCE_URL = process.env.SOURCE_URL?.replace(/\/$/, "");
const SOURCE_DEPLOY_KEY = process.env.SOURCE_DEPLOY_KEY;
const TARGET_URL = process.env.TARGET_URL?.replace(/\/$/, "");
const TARGET_DEPLOY_KEY = process.env.TARGET_DEPLOY_KEY;

// Dry run mode - if true, only exports data without importing
const DRY_RUN = process.env.DRY_RUN === "true";

// ============================================================================
// Types
// ============================================================================

interface Doc {
  _id: string;
  _creationTime: number;
  [key: string]: unknown;
}

interface PaginatedResult {
  documents: Doc[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ============================================================================
// Validation
// ============================================================================

function validateConfig() {
  const missing: string[] = [];
  if (!SOURCE_URL) missing.push("SOURCE_URL");
  if (!SOURCE_DEPLOY_KEY) missing.push("SOURCE_DEPLOY_KEY");
  if (!TARGET_URL) missing.push("TARGET_URL");
  if (!TARGET_DEPLOY_KEY) missing.push("TARGET_DEPLOY_KEY");

  if (missing.length > 0) {
    console.error("Missing required environment variables:", missing.join(", "));
    console.error("\nSee script header for usage examples.");
    process.exit(1);
  }

  console.log("Migration configuration:");
  console.log(`  Source: ${SOURCE_URL}`);
  console.log(`  Target: ${TARGET_URL}`);
  if (DRY_RUN) console.log("  Mode: DRY RUN (no changes will be made)");
  console.log("");
}

// ============================================================================
// Convex Clients
// ============================================================================

function createSourceClient(): ConvexHttpClient {
  const client = new ConvexHttpClient(SOURCE_URL!);
  client.setAdminAuth(SOURCE_DEPLOY_KEY!);
  return client;
}

function createTargetClient(): ConvexHttpClient {
  const client = new ConvexHttpClient(TARGET_URL!);
  client.setAdminAuth(TARGET_DEPLOY_KEY!);
  return client;
}

// ============================================================================
// Export Functions (using Convex queries)
// ============================================================================

async function exportSimpleTable(
  client: ConvexHttpClient,
  functionName: string,
  tableName: string
): Promise<Doc[]> {
  console.log(`  Exporting ${tableName}...`);
  try {
    const result = await client.query(functionName as any, {});
    const docs = result as Doc[];
    console.log(`    → ${docs.length} documents`);
    return docs;
  } catch (error) {
    console.log(`    → Error: ${error}`);
    return [];
  }
}

async function exportPaginatedTable(
  client: ConvexHttpClient,
  functionName: string,
  tableName: string
): Promise<Doc[]> {
  console.log(`  Exporting ${tableName}...`);
  const allDocs: Doc[] = [];
  let cursor: string | null = null;

  try {
    while (true) {
      const result = await client.query(functionName as any, {
        cursor: cursor ?? undefined,
        limit: 100,
      }) as PaginatedResult;

      allDocs.push(...result.documents);

      if (!result.hasMore || !result.nextCursor) {
        break;
      }
      cursor = result.nextCursor;
      process.stdout.write(`\r    → ${allDocs.length} documents...`);
    }
    console.log(`\r    → ${allDocs.length} documents    `);
    return allDocs;
  } catch (error) {
    console.log(`    → Error: ${error}`);
    return [];
  }
}

// ============================================================================
// Storage Migration
// ============================================================================

const STORAGE_ID_FIELDS: Record<string, string[]> = {
  card_season: ["cardBackStorageId"],
  catdex: [
    "defaultCardStorageId",
    "defaultCardThumbStorageId",
    "customCardStorageId",
    "customCardThumbStorageId",
  ],
  collection: ["blurImgStorageId", "previewImgStorageId", "fullImgStorageId"],
  cat_images: ["storageId"],
};

function collectStorageIds(allData: Map<string, Doc[]>): Set<string> {
  const storageIds = new Set<string>();

  for (const [tableName, documents] of allData) {
    const fields = STORAGE_ID_FIELDS[tableName];
    if (!fields) continue;

    for (const doc of documents) {
      for (const field of fields) {
        const storageId = doc[field] as string | undefined;
        if (storageId) {
          storageIds.add(storageId);
        }
      }
    }
  }

  return storageIds;
}

async function migrateStorageFiles(
  sourceClient: ConvexHttpClient,
  targetClient: ConvexHttpClient,
  storageIds: Set<string>
): Promise<Map<string, string>> {
  console.log(`\nMigrating ${storageIds.size} storage files...\n`);

  if (DRY_RUN) {
    console.log("  (Skipped in dry run mode)\n");
    return new Map();
  }

  if (storageIds.size === 0) {
    console.log("  No files to migrate.\n");
    return new Map();
  }

  const idMapping = new Map<string, string>();
  let migrated = 0;
  let failed = 0;
  const total = storageIds.size;

  for (const oldStorageId of storageIds) {
    process.stdout.write(`\r  Progress: ${migrated + failed}/${total} (${migrated} ok, ${failed} failed)`);

    try {
      // Get file URL from source
      const fileUrl = await sourceClient.query("migrationExport:getStorageUrl" as any, {
        storageId: oldStorageId,
      }) as string | null;

      if (!fileUrl) {
        failed++;
        continue;
      }

      // Download file
      const fileResponse = await fetch(fileUrl);
      if (!fileResponse.ok) {
        failed++;
        continue;
      }

      const contentType = fileResponse.headers.get("content-type") || "application/octet-stream";
      const fileData = await fileResponse.blob();

      // Upload to target
      const uploadUrl = await targetClient.mutation("migrationImport:generateMigrationUploadUrl" as any, {});

      const uploadResponse = await fetch(uploadUrl as string, {
        method: "POST",
        headers: { "Content-Type": contentType },
        body: fileData,
      });

      if (!uploadResponse.ok) {
        failed++;
        continue;
      }

      const { storageId: newStorageId } = await uploadResponse.json();
      idMapping.set(oldStorageId, newStorageId);
      migrated++;
    } catch (error) {
      console.log(`\n    Error migrating ${oldStorageId}: ${error}`);
      failed++;
    }
  }

  console.log(`\r  Done: ${migrated} migrated, ${failed} failed                    \n`);
  return idMapping;
}

// ============================================================================
// Import Functions
// ============================================================================

// Track ID mappings for cross-table references
const idMappings = {
  cat_profile: new Map<string, string>(),
  perfect_cats: new Map<string, string>(),
  stream_sessions: new Map<string, string>(),
  stream_participants: new Map<string, string>(),
};

async function importCardSeasons(
  targetClient: ConvexHttpClient,
  documents: Doc[],
  storageMapping: Map<string, string>
): Promise<void> {
  console.log(`  Importing card_season (${documents.length})...`);
  if (DRY_RUN || documents.length === 0) return;

  let imported = 0;
  for (const doc of documents) {
    try {
      await targetClient.mutation("migrationImport:importCardSeason" as any, {
        seasonName: doc.seasonName,
        shortName: doc.shortName,
        cardBackStorageId: storageMapping.get(doc.cardBackStorageId as string) || doc.cardBackStorageId,
        cardBackName: doc.cardBackName,
        cardBackWidth: doc.cardBackWidth,
        cardBackHeight: doc.cardBackHeight,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      });
      imported++;
    } catch (error) {
      console.log(`\n    Error: ${error}`);
    }
  }
  console.log(`    → ${imported} imported`);
}

async function importRarities(
  targetClient: ConvexHttpClient,
  documents: Doc[]
): Promise<void> {
  console.log(`  Importing rarity (${documents.length})...`);
  if (DRY_RUN || documents.length === 0) return;

  let imported = 0;
  for (const doc of documents) {
    try {
      await targetClient.mutation("migrationImport:importRarity" as any, {
        rarityName: doc.rarityName,
        stars: doc.stars,
        chancePercent: doc.chancePercent,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      });
      imported++;
    } catch (error) {
      console.log(`\n    Error: ${error}`);
    }
  }
  console.log(`    → ${imported} imported`);
}

async function importCatdex(
  targetClient: ConvexHttpClient,
  documents: Doc[],
  storageMapping: Map<string, string>,
  seasonDocs: Doc[],
  rarityDocs: Doc[]
): Promise<void> {
  console.log(`  Importing catdex (${documents.length})...`);
  if (DRY_RUN || documents.length === 0) return;

  // Build lookup maps: old ID -> name
  const seasonIdToName = new Map<string, string>();
  for (const s of seasonDocs) {
    seasonIdToName.set(s._id, s.seasonName as string);
  }

  const rarityIdToName = new Map<string, string>();
  for (const r of rarityDocs) {
    rarityIdToName.set(r._id, r.rarityName as string);
  }

  let imported = 0;
  for (const doc of documents) {
    const seasonName = seasonIdToName.get(doc.seasonId as string);
    const rarityName = rarityIdToName.get(doc.rarityId as string);

    if (!seasonName || !rarityName) {
      console.log(`\n    Skipping: missing season/rarity reference`);
      continue;
    }

    try {
      await targetClient.mutation("migrationImport:importCatdexRecord" as any, {
        twitchUserName: doc.twitchUserName,
        catName: doc.catName,
        seasonName,
        rarityName,
        cardNumber: doc.cardNumber,
        approved: doc.approved,
        defaultCardStorageId: storageMapping.get(doc.defaultCardStorageId as string) || doc.defaultCardStorageId,
        defaultCardName: doc.defaultCardName,
        defaultCardWidth: doc.defaultCardWidth,
        defaultCardHeight: doc.defaultCardHeight,
        defaultCardThumbStorageId: storageMapping.get(doc.defaultCardThumbStorageId as string) || doc.defaultCardThumbStorageId,
        defaultCardThumbName: doc.defaultCardThumbName,
        defaultCardThumbWidth: doc.defaultCardThumbWidth,
        defaultCardThumbHeight: doc.defaultCardThumbHeight,
        customCardStorageId: storageMapping.get(doc.customCardStorageId as string) || doc.customCardStorageId,
        customCardName: doc.customCardName,
        customCardWidth: doc.customCardWidth,
        customCardHeight: doc.customCardHeight,
        customCardThumbStorageId: storageMapping.get(doc.customCardThumbStorageId as string) || doc.customCardThumbStorageId,
        customCardThumbName: doc.customCardThumbName,
        customCardThumbWidth: doc.customCardThumbWidth,
        customCardThumbHeight: doc.customCardThumbHeight,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      });
      imported++;
      if (imported % 10 === 0) {
        process.stdout.write(`\r    → ${imported}/${documents.length}`);
      }
    } catch (error) {
      console.log(`\n    Error: ${error}`);
    }
  }
  console.log(`\r    → ${imported} imported              `);
}

async function importCollection(
  targetClient: ConvexHttpClient,
  documents: Doc[],
  storageMapping: Map<string, string>
): Promise<void> {
  console.log(`  Importing collection (${documents.length})...`);
  if (DRY_RUN || documents.length === 0) return;

  let imported = 0;
  for (const doc of documents) {
    try {
      await targetClient.mutation("migrationImport:importCollection" as any, {
        artistName: doc.artistName,
        animal: doc.animal,
        link: doc.link,
        blurImgStorageId: storageMapping.get(doc.blurImgStorageId as string) || doc.blurImgStorageId,
        blurImgName: doc.blurImgName,
        previewImgStorageId: storageMapping.get(doc.previewImgStorageId as string) || doc.previewImgStorageId,
        previewImgName: doc.previewImgName,
        previewImgWidth: doc.previewImgWidth,
        previewImgHeight: doc.previewImgHeight,
        fullImgStorageId: storageMapping.get(doc.fullImgStorageId as string) || doc.fullImgStorageId,
        fullImgName: doc.fullImgName,
        fullImgWidth: doc.fullImgWidth,
        fullImgHeight: doc.fullImgHeight,
        focusX: doc.focusX,
        focusY: doc.focusY,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      });
      imported++;
    } catch (error) {
      console.log(`\n    Error: ${error}`);
    }
  }
  console.log(`    → ${imported} imported`);
}

async function importCatProfiles(
  targetClient: ConvexHttpClient,
  documents: Doc[]
): Promise<void> {
  console.log(`  Importing cat_profile (${documents.length})...`);
  if (DRY_RUN || documents.length === 0) return;

  let imported = 0;
  for (const doc of documents) {
    try {
      const result = await targetClient.mutation("migrationImport:importCatProfile" as any, {
        oldId: doc._id,
        slug: doc.slug,
        catData: doc.catData,
        catName: doc.catName,
        creatorName: doc.creatorName,
        previewsUpdatedAt: doc.previewsUpdatedAt,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      }) as { id: string; oldId: string };

      idMappings.cat_profile.set(doc._id, result.id);
      imported++;
      if (imported % 10 === 0) {
        process.stdout.write(`\r    → ${imported}/${documents.length}`);
      }
    } catch (error) {
      console.log(`\n    Error: ${error}`);
    }
  }
  console.log(`\r    → ${imported} imported              `);
}

async function importCatImages(
  targetClient: ConvexHttpClient,
  documents: Doc[],
  storageMapping: Map<string, string>
): Promise<void> {
  console.log(`  Importing cat_images (${documents.length})...`);
  if (DRY_RUN || documents.length === 0) return;

  let imported = 0;
  let skipped = 0;
  for (const doc of documents) {
    const newProfileId = idMappings.cat_profile.get(doc.catProfileId as string);
    const newStorageId = storageMapping.get(doc.storageId as string);

    if (!newProfileId || !newStorageId) {
      skipped++;
      continue;
    }

    try {
      await targetClient.mutation("migrationImport:importCatImage" as any, {
        catProfileId: newProfileId,
        kind: doc.kind,
        storageId: newStorageId,
        filename: doc.filename,
        meta: doc.meta,
        width: doc.width,
        height: doc.height,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      });
      imported++;
    } catch (error) {
      console.log(`\n    Error: ${error}`);
    }
  }
  console.log(`    → ${imported} imported, ${skipped} skipped`);
}

async function importSimpleTable(
  targetClient: ConvexHttpClient,
  tableName: string,
  mutationName: string,
  documents: Doc[],
  buildArgs: (doc: Doc) => Record<string, unknown>
): Promise<void> {
  console.log(`  Importing ${tableName} (${documents.length})...`);
  if (DRY_RUN || documents.length === 0) return;

  let imported = 0;
  for (const doc of documents) {
    try {
      await targetClient.mutation(mutationName as any, buildArgs(doc));
      imported++;
    } catch (error) {
      console.log(`\n    Error: ${error}`);
    }
  }
  console.log(`    → ${imported} imported`);
}

async function importPerfectCats(
  targetClient: ConvexHttpClient,
  documents: Doc[]
): Promise<void> {
  console.log(`  Importing perfect_cats (${documents.length})...`);
  if (DRY_RUN || documents.length === 0) return;

  let imported = 0;
  for (const doc of documents) {
    try {
      const result = await targetClient.mutation("migrationImport:importPerfectCat" as any, {
        oldId: doc._id,
        hash: doc.hash,
        params: doc.params,
        rating: doc.rating,
        wins: doc.wins,
        losses: doc.losses,
        appearances: doc.appearances,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        lastShownAt: doc.lastShownAt,
      }) as { id: string; oldId: string };

      idMappings.perfect_cats.set(doc._id, result.id);
      imported++;
    } catch (error) {
      console.log(`\n    Error: ${error}`);
    }
  }
  console.log(`    → ${imported} imported`);
}

async function importPerfectVotes(
  targetClient: ConvexHttpClient,
  documents: Doc[]
): Promise<void> {
  console.log(`  Importing perfect_votes (${documents.length})...`);
  if (DRY_RUN || documents.length === 0) return;

  let imported = 0;
  let skipped = 0;
  for (const doc of documents) {
    const newCatAId = idMappings.perfect_cats.get(doc.catAId as string);
    const newCatBId = idMappings.perfect_cats.get(doc.catBId as string);
    const newWinnerId = idMappings.perfect_cats.get(doc.winnerId as string);

    if (!newCatAId || !newCatBId || !newWinnerId) {
      skipped++;
      continue;
    }

    try {
      await targetClient.mutation("migrationImport:importPerfectVote" as any, {
        catAId: newCatAId,
        catBId: newCatBId,
        winnerId: newWinnerId,
        clientId: doc.clientId,
        createdAt: doc.createdAt,
      });
      imported++;
    } catch (error) {
      console.log(`\n    Error: ${error}`);
    }
  }
  console.log(`    → ${imported} imported, ${skipped} skipped`);
}

async function importStreamSessions(
  targetClient: ConvexHttpClient,
  documents: Doc[]
): Promise<void> {
  console.log(`  Importing stream_sessions (${documents.length})...`);
  if (DRY_RUN || documents.length === 0) return;

  let imported = 0;
  for (const doc of documents) {
    try {
      const result = await targetClient.mutation("migrationImport:importStreamSession" as any, {
        oldId: doc._id,
        viewerKey: doc.viewerKey,
        status: doc.status,
        currentStep: doc.currentStep,
        stepIndex: doc.stepIndex,
        stepHistory: doc.stepHistory,
        params: doc.params,
        allowRepeatIps: doc.allowRepeatIps,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      }) as { id: string; oldId: string };

      idMappings.stream_sessions.set(doc._id, result.id);
      imported++;
    } catch (error) {
      console.log(`\n    Error: ${error}`);
    }
  }
  console.log(`    → ${imported} imported`);
}

async function importStreamParticipants(
  targetClient: ConvexHttpClient,
  documents: Doc[]
): Promise<void> {
  console.log(`  Importing stream_participants (${documents.length})...`);
  if (DRY_RUN || documents.length === 0) return;

  let imported = 0;
  let skipped = 0;
  for (const doc of documents) {
    const newSessionId = idMappings.stream_sessions.get(doc.sessionId as string);
    if (!newSessionId) {
      skipped++;
      continue;
    }

    try {
      const result = await targetClient.mutation("migrationImport:importStreamParticipant" as any, {
        oldId: doc._id,
        sessionId: newSessionId,
        viewerSession: doc.viewerSession,
        displayName: doc.displayName,
        status: doc.status,
        fingerprint: doc.fingerprint,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      }) as { id: string; oldId: string };

      idMappings.stream_participants.set(doc._id, result.id);
      imported++;
    } catch (error) {
      console.log(`\n    Error: ${error}`);
    }
  }
  console.log(`    → ${imported} imported, ${skipped} skipped`);
}

async function importStreamVotes(
  targetClient: ConvexHttpClient,
  documents: Doc[]
): Promise<void> {
  console.log(`  Importing stream_votes (${documents.length})...`);
  if (DRY_RUN || documents.length === 0) return;

  let imported = 0;
  let skipped = 0;
  for (const doc of documents) {
    const newSessionId = idMappings.stream_sessions.get(doc.sessionId as string);
    if (!newSessionId) {
      skipped++;
      continue;
    }

    const newVotedBy = doc.votedBy
      ? idMappings.stream_participants.get(doc.votedBy as string)
      : undefined;

    try {
      await targetClient.mutation("migrationImport:importStreamVote" as any, {
        sessionId: newSessionId,
        stepId: doc.stepId,
        optionKey: doc.optionKey,
        optionMeta: doc.optionMeta,
        votedBy: newVotedBy,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      });
      imported++;
    } catch (error) {
      console.log(`\n    Error: ${error}`);
    }
  }
  console.log(`    → ${imported} imported, ${skipped} skipped`);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║           Convex Migration: Self-Hosted → Cloud                ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  validateConfig();

  const sourceClient = createSourceClient();
  const targetClient = createTargetClient();

  // ========== PHASE 1: Export all data from source ==========
  console.log("Phase 1: Exporting data from source...\n");

  const allData = new Map<string, Doc[]>();

  // Tier 1: Reference tables (simple, non-paginated)
  allData.set("card_season", await exportSimpleTable(sourceClient, "migrationExport:exportCardSeasons", "card_season"));
  allData.set("rarity", await exportSimpleTable(sourceClient, "migrationExport:exportRarities", "rarity"));

  // Tier 2: Core data
  allData.set("catdex", (await exportPaginatedTable(sourceClient, "migrationExport:exportCatdex", "catdex")));
  allData.set("collection", await exportSimpleTable(sourceClient, "migrationExport:exportCollection", "collection"));
  allData.set("cat_profile", (await exportPaginatedTable(sourceClient, "migrationExport:exportCatProfiles", "cat_profile")));
  allData.set("cat_images", (await exportPaginatedTable(sourceClient, "migrationExport:exportCatImages", "cat_images")));
  allData.set("adoption_batch", await exportSimpleTable(sourceClient, "migrationExport:exportAdoptionBatches", "adoption_batch"));

  // Tier 3: Simple data
  allData.set("cat_shares", (await exportPaginatedTable(sourceClient, "migrationExport:exportCatShares", "cat_shares")));
  allData.set("single_cat_settings", await exportSimpleTable(sourceClient, "migrationExport:exportSingleCatSettings", "single_cat_settings"));
  allData.set("perfect_cats", (await exportPaginatedTable(sourceClient, "migrationExport:exportPerfectCats", "perfect_cats")));
  allData.set("perfect_votes", (await exportPaginatedTable(sourceClient, "migrationExport:exportPerfectVotes", "perfect_votes")));

  // Tier 4: Session data
  allData.set("stream_sessions", await exportSimpleTable(sourceClient, "migrationExport:exportStreamSessions", "stream_sessions"));
  allData.set("stream_participants", (await exportPaginatedTable(sourceClient, "migrationExport:exportStreamParticipants", "stream_participants")));
  allData.set("stream_votes", (await exportPaginatedTable(sourceClient, "migrationExport:exportStreamVotes", "stream_votes")));
  allData.set("wheel_spins", (await exportPaginatedTable(sourceClient, "migrationExport:exportWheelSpins", "wheel_spins")));
  allData.set("coinflipper_scores", await exportSimpleTable(sourceClient, "migrationExport:exportCoinflipperScores", "coinflipper_scores"));
  allData.set("discord_challenge", await exportSimpleTable(sourceClient, "migrationExport:exportDiscordChallenges", "discord_challenge"));

  // ========== PHASE 2: Migrate storage files ==========
  console.log("\nPhase 2: Migrating storage files...");
  const storageIds = collectStorageIds(allData);
  const storageMapping = await migrateStorageFiles(sourceClient, targetClient, storageIds);

  // ========== PHASE 3: Import data to target ==========
  console.log("Phase 3: Importing data to target...\n");

  // Tier 1: Reference tables
  await importCardSeasons(targetClient, allData.get("card_season") || [], storageMapping);
  await importRarities(targetClient, allData.get("rarity") || []);

  // Tier 2: Core data
  await importCatdex(
    targetClient,
    allData.get("catdex") || [],
    storageMapping,
    allData.get("card_season") || [],
    allData.get("rarity") || []
  );
  await importCollection(targetClient, allData.get("collection") || [], storageMapping);
  await importCatProfiles(targetClient, allData.get("cat_profile") || []);
  await importCatImages(targetClient, allData.get("cat_images") || [], storageMapping);

  // Tier 3: Simple data
  await importSimpleTable(targetClient, "cat_shares", "migrationImport:importCatShare", allData.get("cat_shares") || [], (doc) => ({
    slug: doc.slug,
    data: doc.data,
    createdAt: doc.createdAt,
  }));

  await importSimpleTable(targetClient, "single_cat_settings", "migrationImport:importSingleCatSettings", allData.get("single_cat_settings") || [], (doc) => ({
    slug: doc.slug,
    config: doc.config,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }));

  await importPerfectCats(targetClient, allData.get("perfect_cats") || []);
  await importPerfectVotes(targetClient, allData.get("perfect_votes") || []);

  // Tier 4: Session data
  await importStreamSessions(targetClient, allData.get("stream_sessions") || []);
  await importStreamParticipants(targetClient, allData.get("stream_participants") || []);
  await importStreamVotes(targetClient, allData.get("stream_votes") || []);

  await importSimpleTable(targetClient, "wheel_spins", "migrationImport:importWheelSpin", allData.get("wheel_spins") || [], (doc) => ({
    prizeName: doc.prizeName,
    forced: doc.forced,
    randomBucket: doc.randomBucket,
    createdAt: doc.createdAt,
  }));

  await importSimpleTable(targetClient, "coinflipper_scores", "migrationImport:importCoinflipperScore", allData.get("coinflipper_scores") || [], (doc) => ({
    playerName: doc.playerName,
    score: doc.score,
    createdAt: doc.createdAt,
  }));

  await importSimpleTable(targetClient, "discord_challenge", "migrationImport:importDiscordChallenge", allData.get("discord_challenge") || [], (doc) => ({
    token: doc.token,
    answerHash: doc.answerHash,
    salt: doc.salt,
    expiresAt: doc.expiresAt,
    createdAt: doc.createdAt,
    usedAt: doc.usedAt,
  }));

  // ========== SUMMARY ==========
  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║                      Migration Complete!                       ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  console.log("Summary:");
  let totalDocs = 0;
  for (const [tableName, docs] of allData) {
    if (docs.length > 0) {
      console.log(`  ${tableName}: ${docs.length} documents`);
      totalDocs += docs.length;
    }
  }
  console.log(`\n  Total documents: ${totalDocs}`);
  console.log(`  Storage files migrated: ${storageMapping.size}`);

  if (DRY_RUN) {
    console.log("\n  ⚠️  This was a DRY RUN - no changes were made to the target.");
  }

  console.log("\nNext steps:");
  console.log("  1. Verify data in Convex Cloud dashboard");
  console.log("  2. Test the application against Convex Cloud");
  console.log("  3. Update production .env.local to point to Convex Cloud");
  console.log("  4. Rebuild and deploy the frontend");
}

main().catch((error) => {
  console.error("\n❌ Migration failed:", error);
  process.exit(1);
});
