import "server-only";

import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { assertImageSourceWithinLimits } from "../../lib/image-source-limits";
import type { Identity } from "../auth/identity";
import { isAdminIdentity, requireAdmin } from "../auth/identity";
import type { Database } from "../db/pool";
import { cardSeason, catdex, files, rarity } from "../db/schema";
import { withTransaction } from "../db/transaction";
import { ServiceError } from "../errors";
import { enqueueJob } from "../jobs/enqueue";
import {
  decodeCursor,
  encodeCursor,
  rowCreationTimestamp,
} from "../pagination";
import {
  attachUploadRow,
  consumeUploadRow,
  countAllRecentUploads,
  countPendingCatdex,
  countRecentUploads,
  deleteUpload,
  insertCatdex,
  insertUploadReservation,
  lockUploadByFileId,
  lockUploadByToken,
  selectCatdexById,
  selectCatdexByLegacyId,
  selectCatdexByOwner,
  selectCatdexPage,
  selectCollectionById,
  selectCollectionPage,
  selectExpiredUploads,
  selectRarities,
  selectSeasons,
  updateCatdex,
  updateCollectionFocus,
} from "../repositories/catalog";
import { storeUploadedFile } from "./files";

const UPLOAD_TTL_MS = 60 * 60 * 1000;
const MAX_UPLOADS_PER_CLIENT_PER_HOUR = 12;
const MAX_UNKEYED_UPLOADS_PER_HOUR = 60;
const MAX_GLOBAL_UPLOADS_PER_HOUR = 600;
const MAX_THUMBNAIL_ATTEMPTS = 3;
const THUMBNAIL_RETRY_AFTER_MS = 30 * 60 * 1000;

export const DEFAULT_SEASONS = [
  { name: "BETA", shortName: "BETA" },
  { name: "Season 1", shortName: "S1" },
] as const;

export const DEFAULT_RARITIES = [
  { name: "Moondust", chancePercent: 40, stars: 1 },
  { name: "Starborn", chancePercent: 25, stars: 2 },
  { name: "Lunara", chancePercent: 15, stars: 3 },
  { name: "Celestara", chancePercent: 10, stars: 4 },
  { name: "Divinara", chancePercent: 6, stars: 5 },
  { name: "Holo Nova", chancePercent: 3, stars: 6 },
  { name: "Singularity", chancePercent: 1, stars: 7 },
] as const;

export interface SeasonPayload {
  id: string;
  season_name: string;
  short_name: string | null;
  card_back: string | null;
  card_back_storage_id: string | null;
  card_back_url: string | null;
  card_back_width: number | null;
  card_back_height: number | null;
  created: number;
  updated: number;
}

export interface RarityPayload {
  id: string;
  rarity_name: string;
  stars: number | null;
  chance_percent: number | null;
  created: number;
  updated: number;
}

export interface CatdexPayload {
  id: string;
  twitch_user_name: string;
  cat_name: string;
  card_number: string | null;
  approved: boolean;
  default_card: string | null;
  default_card_storage_id: string | null;
  default_card_url: string | null;
  default_card_width: number | null;
  default_card_height: number | null;
  default_card_thumb: string | null;
  default_card_thumb_storage_id: string | null;
  default_card_thumb_url: string | null;
  default_card_thumb_width: number | null;
  default_card_thumb_height: number | null;
  custom_card: string | null;
  custom_card_storage_id: string | null;
  custom_card_url: string | null;
  custom_card_width: number | null;
  custom_card_height: number | null;
  custom_card_thumb: string | null;
  custom_card_thumb_storage_id: string | null;
  custom_card_thumb_url: string | null;
  custom_card_thumb_width: number | null;
  custom_card_thumb_height: number | null;
  season: string | null;
  seasonRaw: SeasonPayload | null;
  seasonShort: string | null;
  rarity: string | null;
  rarityRaw: RarityPayload | null;
  rarityStars: number | null;
  created: number;
  updated: number;
}

export interface CollectionPayload {
  id: string;
  artist_name: string;
  animal: string;
  link: string;
  blur_img: string | null;
  preview_img: string | null;
  full_img: string | null;
  blur_img_storage_id: string | null;
  preview_img_storage_id: string | null;
  full_img_storage_id: string | null;
  preview_img_width: number | null;
  preview_img_height: number | null;
  full_img_width: number | null;
  full_img_height: number | null;
  focusX: number;
  focusY: number;
  created: number;
  updated: number;
}

function fileUrl(id: string | null | undefined): string | null {
  return id ? `/api/files/${encodeURIComponent(id)}` : null;
}

function millis(value: Date | null | undefined): number {
  return value?.getTime() ?? 0;
}

function seasonPayload(row: typeof cardSeason.$inferSelect): SeasonPayload {
  return {
    id: row.id,
    season_name: row.seasonName,
    short_name: row.shortName ?? null,
    card_back: row.cardBackName ?? null,
    card_back_storage_id: row.cardBackFileId ?? null,
    card_back_url: fileUrl(row.cardBackFileId),
    card_back_width: row.cardBackWidth ?? null,
    card_back_height: row.cardBackHeight ?? null,
    created: millis(row.createdAt),
    updated: millis(row.updatedAt),
  };
}

function rarityPayload(row: typeof rarity.$inferSelect): RarityPayload {
  return {
    id: row.id,
    rarity_name: row.rarityName,
    stars: row.stars ?? null,
    chance_percent: row.chancePercent ?? null,
    created: millis(row.createdAt),
    updated: millis(row.updatedAt),
  };
}

type JoinedCatdex = Awaited<ReturnType<typeof selectCatdexById>>;

function catdexPayload(row: NonNullable<JoinedCatdex>): CatdexPayload {
  const cat = row.cat;
  const season = row.season ? seasonPayload(row.season) : null;
  const rarityInfo = row.rarity ? rarityPayload(row.rarity) : null;
  return {
    id: cat.id,
    twitch_user_name: cat.twitchUserName,
    cat_name: cat.catName,
    card_number: cat.cardNumber ?? null,
    approved: cat.approved,
    default_card: cat.defaultCardName ?? null,
    default_card_storage_id: cat.defaultCardFileId ?? null,
    default_card_url: fileUrl(cat.defaultCardFileId),
    default_card_width: cat.defaultCardWidth ?? null,
    default_card_height: cat.defaultCardHeight ?? null,
    default_card_thumb: cat.defaultCardThumbName ?? null,
    default_card_thumb_storage_id: cat.defaultCardThumbFileId ?? null,
    default_card_thumb_url: fileUrl(cat.defaultCardThumbFileId),
    default_card_thumb_width: cat.defaultCardThumbWidth ?? null,
    default_card_thumb_height: cat.defaultCardThumbHeight ?? null,
    custom_card: cat.customCardName ?? null,
    custom_card_storage_id: cat.customCardFileId ?? null,
    custom_card_url: fileUrl(cat.customCardFileId),
    custom_card_width: cat.customCardWidth ?? null,
    custom_card_height: cat.customCardHeight ?? null,
    custom_card_thumb: cat.customCardThumbName ?? null,
    custom_card_thumb_storage_id: cat.customCardThumbFileId ?? null,
    custom_card_thumb_url: fileUrl(cat.customCardThumbFileId),
    custom_card_thumb_width: cat.customCardThumbWidth ?? null,
    custom_card_thumb_height: cat.customCardThumbHeight ?? null,
    season: season?.season_name ?? null,
    seasonRaw: season,
    seasonShort: season?.short_name ?? null,
    rarity: rarityInfo?.rarity_name ?? null,
    rarityRaw: rarityInfo,
    rarityStars: rarityInfo?.stars ?? null,
    created: millis(cat.createdAt),
    updated: millis(cat.updatedAt),
  };
}

function clampFocus(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.round(Math.max(0, Math.min(100, value)));
}

export async function listSeasons(db: Database): Promise<SeasonPayload[]> {
  const rows = await selectSeasons(db);
  return rows.map(seasonPayload);
}

export async function countSeasons(db: Database): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(cardSeason);
  return Number(row?.count ?? 0);
}

export async function listRarities(
  db: Database | import("../db/transaction").Transaction,
): Promise<RarityPayload[]> {
  const rows = await selectRarities(db);
  return rows
    .sort((a, b) => (a.stars ?? 0) - (b.stars ?? 0))
    .map(rarityPayload);
}

export async function countRarities(db: Database): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(rarity);
  return Number(row?.count ?? 0);
}

export async function ensureDefaultSeasons(db: Database) {
  await withTransaction(db, async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended('beastypage:catalog:defaults', 0))`,
    );
    for (const entry of DEFAULT_SEASONS) {
      const [existing] = await tx
        .select({ id: cardSeason.id, shortName: cardSeason.shortName })
        .from(cardSeason)
        .where(eq(cardSeason.seasonName, entry.name))
        .limit(1);
      if (existing) {
        if (existing.shortName !== entry.shortName) {
          await tx
            .update(cardSeason)
            .set({ shortName: entry.shortName, updatedAt: new Date() })
            .where(eq(cardSeason.id, existing.id));
        }
      } else {
        const now = new Date();
        await tx.insert(cardSeason).values({
          seasonName: entry.name,
          shortName: entry.shortName,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  });
}

export async function ensureDefaultRarities(db: Database) {
  await withTransaction(db, async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended('beastypage:catalog:defaults', 0))`,
    );
    for (const entry of DEFAULT_RARITIES) {
      const [existing] = await tx
        .select({
          id: rarity.id,
          stars: rarity.stars,
          chancePercent: rarity.chancePercent,
        })
        .from(rarity)
        .where(eq(rarity.rarityName, entry.name))
        .limit(1);
      if (existing) {
        if (
          existing.stars !== entry.stars ||
          existing.chancePercent !== entry.chancePercent
        ) {
          await tx
            .update(rarity)
            .set({
              stars: entry.stars,
              chancePercent: entry.chancePercent,
              updatedAt: new Date(),
            })
            .where(eq(rarity.id, existing.id));
        }
      } else {
        const now = new Date();
        await tx.insert(rarity).values({
          rarityName: entry.name,
          stars: entry.stars,
          chancePercent: entry.chancePercent,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  });
}

export async function listCatdex(
  db: Database,
  options: {
    cursor?: string | null;
    pageSize?: number;
    approved?: boolean;
  } = {},
) {
  if (options.approved === false) {
    throw new ServiceError(
      "forbidden",
      "Pending Catdex records require moderation access",
    );
  }
  const pageSize = Math.max(1, Math.min(options.pageSize ?? 48, 48));
  const rows = await selectCatdexPage(db, {
    cursor: decodeCursor(options.cursor),
    pageSize,
    approved: true,
  });
  const hasMore = rows.length > pageSize;
  const page = rows.slice(0, pageSize);
  const last = page.at(-1)?.cat;
  return {
    page: page.map((row) => catdexPayload(row)),
    nextCursor:
      hasMore && last
        ? encodeCursor({ createdAt: rowCreationTimestamp(last), id: last.id })
        : null,
    isDone: !hasMore,
  };
}

export async function listCatdexLegacy(db: Database, limit = 48) {
  const result = await listCatdex(db, {
    pageSize: Math.min(48, Math.max(1, limit)),
  });
  return result.page.sort((a, b) => b.updated - a.updated);
}

export async function listCatdexForOwner(
  db: Database,
  owner: string,
  options: { cursor?: string | null; pageSize?: number } = {},
) {
  const pageSize = Math.max(1, Math.min(options.pageSize ?? 48, 48));
  const rows = await selectCatdexByOwner(
    db,
    owner,
    decodeCursor(options.cursor),
    pageSize,
  );
  const hasMore = rows.length > pageSize;
  const page = rows.slice(0, pageSize);
  const last = page.at(-1)?.cat;
  return {
    page: page.map((row) => catdexPayload(row)),
    nextCursor:
      hasMore && last
        ? encodeCursor({
            createdAt: rowCreationTimestamp(last),
            id: last.id,
          })
        : null,
    isDone: !hasMore,
  };
}

export async function listCatdexForModeration(
  db: Database,
  approved: boolean,
  options: { cursor?: string | null; pageSize?: number } = {},
  identity?: Identity,
) {
  await requireAdmin(identity);
  const pageSize = Math.max(1, Math.min(options.pageSize ?? 48, 48));
  const rows = await selectCatdexPage(db, {
    cursor: decodeCursor(options.cursor),
    pageSize,
    approved,
  });
  const hasMore = rows.length > pageSize;
  const page = rows.slice(0, pageSize);
  const last = page.at(-1)?.cat;
  return {
    page: page.map((row) => catdexPayload(row)),
    nextCursor:
      hasMore && last
        ? encodeCursor({ createdAt: rowCreationTimestamp(last), id: last.id })
        : null,
    isDone: !hasMore,
  };
}

export async function hasPendingCatdex(db: Database): Promise<boolean> {
  return (await countPendingCatdex(db)) > 0;
}

export async function getCatdex(
  db: Database,
  id: string,
  options: { includePending?: boolean } = {},
): Promise<CatdexPayload | null> {
  const row = await selectCatdexById(db, id);
  if (!row) return null;
  if (!row.cat.approved && !options.includePending) return null;
  return catdexPayload(row);
}

export async function getCatdexByLink(
  db: Database,
  value: string,
  options: { includePending?: boolean } = {},
): Promise<CatdexPayload | null> {
  const row = await selectCatdexByLegacyId(db, value);
  if (!row) return getCatdex(db, value, options);
  if (!row.cat.approved && !options.includePending) return null;
  return catdexPayload(row);
}

export interface UploadCardInput {
  storageId: string;
  fileName: string;
  uploadToken?: string;
}

export interface CreateCatdexInput {
  twitchUserName: string;
  catName: string;
  seasonId: string;
  rarityId: string;
  cardNumber?: string;
  defaultCard: UploadCardInput;
  customCard?: UploadCardInput;
}

async function consumeUpload(
  tx: import("../db/transaction").Transaction,
  card: UploadCardInput,
) {
  const upload = card.uploadToken
    ? await lockUploadByToken(tx, card.uploadToken)
    : await lockUploadByFileId(tx, card.storageId);
  if (
    upload?.status !== "attached" ||
    upload.fileId !== card.storageId ||
    upload.expiresAt.getTime() <= Date.now()
  ) {
    throw new ServiceError(
      "invalid_input",
      "Card upload was not issued for this submission.",
    );
  }
  await consumeUploadRow(tx, upload.id);
}

async function fileDimensions(
  tx: import("../db/transaction").Transaction,
  id: string,
) {
  const [file] = await tx
    .select({
      id: files.id,
      mimeType: files.mimeType,
      byteSize: files.byteSize,
      width: files.width,
      height: files.height,
    })
    .from(files)
    .where(eq(files.id, id))
    .limit(1);
  if (!file) {
    throw new ServiceError(
      "invalid_input",
      "Card upload was not found or has expired.",
    );
  }
  if (file.byteSize > 10 * 1024 * 1024) {
    throw new ServiceError(
      "invalid_input",
      "Card uploads must be 10 MiB or smaller.",
    );
  }
  if (file.mimeType !== "image/png" && file.mimeType !== "image/jpeg") {
    throw new ServiceError(
      "invalid_input",
      "Card uploads must be PNG or JPEG images.",
    );
  }
  return file;
}

export async function createCatdex(
  db: Database,
  input: CreateCatdexInput,
): Promise<CatdexPayload> {
  const twitchUserName = input.twitchUserName.trim();
  const catName = input.catName.trim();
  if (!twitchUserName || !catName || !input.seasonId || !input.rarityId) {
    throw new ServiceError("invalid_input", "Invalid Catdex submission");
  }
  if (!input.defaultCard?.storageId || !input.defaultCard.fileName) {
    throw new ServiceError("invalid_input", "Default card upload is required");
  }
  const row = await withTransaction(db, async (tx) => {
    const [season] = await tx
      .select({ id: cardSeason.id })
      .from(cardSeason)
      .where(eq(cardSeason.id, input.seasonId))
      .limit(1);
    if (!season)
      throw new ServiceError("invalid_input", "Season was not found.");
    const [rarityRow] = await tx
      .select({ id: rarity.id })
      .from(rarity)
      .where(eq(rarity.id, input.rarityId))
      .limit(1);
    if (!rarityRow)
      throw new ServiceError("invalid_input", "Rarity was not found.");
    const defaultFile = await fileDimensions(tx, input.defaultCard.storageId);
    await consumeUpload(tx, input.defaultCard);
    const customFile = input.customCard
      ? await fileDimensions(tx, input.customCard.storageId)
      : null;
    if (input.customCard) await consumeUpload(tx, input.customCard);
    const now = new Date();
    const inserted = await insertCatdex(tx, {
      twitchUserName,
      catName,
      seasonId: input.seasonId,
      rarityId: input.rarityId,
      cardNumber: input.cardNumber?.trim() || null,
      approved: false,
      defaultCardFileId: defaultFile.id,
      defaultCardName: input.defaultCard.fileName,
      defaultCardWidth: defaultFile.width,
      defaultCardHeight: defaultFile.height,
      customCardFileId: customFile?.id ?? null,
      customCardName: input.customCard?.fileName ?? null,
      customCardWidth: customFile?.width ?? null,
      customCardHeight: customFile?.height ?? null,
      thumbnailStatus: "processing",
      thumbnailAttemptedAt: now,
      thumbnailAttemptCount: 1,
      createdAt: now,
      updatedAt: now,
    });
    if (!inserted)
      throw new ServiceError("conflict", "Failed to create catdex record");
    await enqueueJob(tx, {
      kind: "catdex.thumbnail",
      dedupeKey: inserted.id,
      payload: { id: inserted.id, attempt: 1 },
    });
    return inserted;
  });
  const result = await selectCatdexById(db, row.id);
  if (!result)
    throw new ServiceError("unavailable", "Failed to create catdex record");
  return catdexPayload(result);
}

export async function issueCatdexUploadUrl(
  db: Database,
  identity: Identity,
  clientKey?: string,
): Promise<string> {
  const now = Date.now();
  const since = new Date(now - 60 * 60 * 1000);
  const anonymousRateKey =
    clientKey && /^[A-Za-z0-9_-]{16,80}$/.test(clientKey)
      ? `client:${clientKey}`
      : null;
  const rateKey = identity.tokenIdentifier
    ? `identity:${identity.tokenIdentifier}`
    : anonymousRateKey;
  const token = randomUUID();
  await withTransaction(db, async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended('beastypage:catdex:upload-rate', 0))`,
    );
    const count = await countRecentUploads(tx, rateKey, since);
    if (
      count >=
      (rateKey ? MAX_UPLOADS_PER_CLIENT_PER_HOUR : MAX_UNKEYED_UPLOADS_PER_HOUR)
    ) {
      throw new ServiceError(
        "rate_limited",
        "Too many pending uploads; try again later",
      );
    }
    if (
      (await countAllRecentUploads(tx, since)) >= MAX_GLOBAL_UPLOADS_PER_HOUR
    ) {
      throw new ServiceError(
        "rate_limited",
        "Too many pending uploads; try again later",
      );
    }
    await insertUploadReservation(tx, {
      token,
      rateKey,
      status: "pending",
      expiresAt: new Date(now + UPLOAD_TTL_MS),
      createdAt: new Date(now),
      updatedAt: new Date(now),
    });
  });
  return `/api/catdex/upload?token=${encodeURIComponent(token)}`;
}

export async function attachCatdexUpload(
  db: Database,
  token: string,
  fileId: string,
): Promise<void> {
  await withTransaction(db, async (tx) => {
    const upload = await lockUploadByToken(tx, token);
    if (
      upload?.status !== "pending" ||
      upload.expiresAt.getTime() <= Date.now()
    ) {
      throw new ServiceError("not_found", "Card upload URL has expired.");
    }
    const [file] = await tx
      .select({ id: files.id })
      .from(files)
      .where(eq(files.id, fileId))
      .limit(1);
    if (!file) throw new ServiceError("invalid_input", "Upload was not stored");
    await attachUploadRow(tx, upload.id, fileId);
  });
}

export async function storeAndAttachCatdexUpload(
  db: Database,
  token: string,
  bytes: Buffer,
  contentType: string,
): Promise<string> {
  return withTransaction(db, async (tx) => {
    const upload = await lockUploadByToken(tx, token);
    if (
      upload?.status !== "pending" ||
      upload.expiresAt.getTime() <= Date.now()
    ) {
      throw new ServiceError("not_found", "Card upload URL has expired.");
    }
    const stored = await storeUploadedFile(tx, bytes, contentType);
    await attachUploadRow(tx, upload.id, stored.id);
    return stored.id;
  });
}

export async function cleanupExpiredCatdexUploads(db: Database, limit = 100) {
  const bounded = Math.max(1, Math.min(limit, 100));
  const expired = await selectExpiredUploads(db, bounded);
  if (!expired.length) return { deleted: 0 };
  await withTransaction(db, async (tx) => {
    for (const upload of expired) await deleteUpload(tx, upload.id);
  });
  return { deleted: expired.length };
}

export async function approveCatdex(
  db: Database,
  id: string,
  identity: Identity,
  approved = true,
) {
  await requireAdmin(identity);
  const row = await withTransaction(db, async (tx) =>
    updateCatdex(tx, id, { approved, updatedAt: new Date() }),
  );
  if (!row) throw new ServiceError("not_found", "Catdex record not found.");
  const result = await selectCatdexById(db, row.id);
  if (!result) throw new ServiceError("not_found", "Catdex record not found.");
  return catdexPayload(result);
}

export async function editCatdex(
  db: Database,
  id: string,
  input: Partial<
    Pick<
      CreateCatdexInput,
      "twitchUserName" | "catName" | "cardNumber" | "seasonId" | "rarityId"
    >
  >,
  identity: Identity,
) {
  await requireAdmin(identity);
  const values = {
    ...(input.twitchUserName !== undefined
      ? { twitchUserName: input.twitchUserName.trim() }
      : {}),
    ...(input.catName !== undefined ? { catName: input.catName.trim() } : {}),
    ...(input.cardNumber !== undefined
      ? { cardNumber: input.cardNumber.trim() || null }
      : {}),
    ...(input.seasonId !== undefined ? { seasonId: input.seasonId } : {}),
    ...(input.rarityId !== undefined ? { rarityId: input.rarityId } : {}),
    updatedAt: new Date(),
  };
  const row = await withTransaction(db, async (tx) =>
    updateCatdex(tx, id, values),
  );
  if (!row) throw new ServiceError("not_found", "Catdex record not found.");
  const result = await selectCatdexById(db, row.id);
  if (!result) throw new ServiceError("not_found", "Catdex record not found.");
  return catdexPayload(result);
}

export async function listCollection(
  db: Database,
  options: { cursor?: string | null; pageSize?: number } = {},
) {
  const pageSize = Math.max(1, Math.min(options.pageSize ?? 36, 36));
  const rows = await selectCollectionPage(db, {
    cursor: decodeCursor(options.cursor),
    pageSize,
  });
  const hasMore = rows.length > pageSize;
  const page = rows.slice(0, pageSize);
  const payload = page.map(collectionPayload);
  const last = page.at(-1);
  return {
    page: payload,
    nextCursor:
      hasMore && last
        ? encodeCursor({
            createdAt: last.createdAt,
            creationAt: rowCreationTimestamp(last),
            id: last.id,
          })
        : null,
    isDone: !hasMore,
  };
}

function collectionPayload(
  row: Awaited<ReturnType<typeof selectCollectionPage>>[number],
): CollectionPayload {
  return {
    id: row.id,
    artist_name: row.artistName,
    animal: row.animal,
    link: row.link,
    blur_img: fileUrl(row.blurImgFileId),
    preview_img: fileUrl(row.previewImgFileId),
    full_img: fileUrl(row.fullImgFileId),
    blur_img_storage_id: row.blurImgFileId ?? null,
    preview_img_storage_id: row.previewImgFileId ?? null,
    full_img_storage_id: row.fullImgFileId ?? null,
    preview_img_width: row.previewImgWidth ?? null,
    preview_img_height: row.previewImgHeight ?? null,
    full_img_width: row.fullImgWidth ?? null,
    full_img_height: row.fullImgHeight ?? null,
    focusX: clampFocus(row.focusX ?? 50),
    focusY: clampFocus(row.focusY ?? 50),
    created: millis(row.createdAt),
    updated: millis(row.updatedAt),
  };
}

type ThumbnailSource = {
  variant: "default" | "custom";
  id: string;
  name: string | null;
  bytes: Buffer | null;
};

export type CatdexThumbnailResult = {
  variant: "default" | "custom";
  name: string;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  buffer: Buffer;
};

export type CatdexThumbnailProcessor = (source: {
  variant: "default" | "custom";
  name: string | null;
  bytes: Buffer;
}) => Promise<CatdexThumbnailResult | null>;

async function processCatdexThumbnail(
  source: Parameters<CatdexThumbnailProcessor>[0],
): Promise<CatdexThumbnailResult | null> {
  try {
    assertImageSourceWithinLimits(source.bytes);
    const metadata = await sharp(source.bytes, {
      failOn: "error",
    }).metadata();
    const sourceWidth = metadata.width ?? 0;
    const sourceHeight = metadata.height ?? 0;
    if (!sourceWidth || !sourceHeight) return null;
    const buffer = await sharp(source.bytes)
      .resize({
        width: 256,
        height: 256,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer();
    const thumbnail = await sharp(buffer).metadata();
    return {
      variant: source.variant,
      name: `${source.name ?? source.variant}-card-thumb.jpg`,
      width: thumbnail.width ?? 0,
      height: thumbnail.height ?? 0,
      sourceWidth,
      sourceHeight,
      buffer,
    };
  } catch {
    // Invalid or undecodable source images are permanent failures.
    return null;
  }
}

export async function listCollectionLegacy(db: Database, limit = 200) {
  const bounded = Math.max(1, Math.min(limit, 200));
  const rows = await selectCollectionPage(db, {
    cursor: null,
    pageSize: bounded,
  });
  return rows.slice(0, bounded).map(collectionPayload);
}

export async function setCollectionFocus(
  db: Database,
  id: string,
  focusX: number,
  focusY: number,
  identity: Identity,
) {
  if (!isAdminIdentity(identity)) {
    throw new ServiceError(
      "forbidden",
      "Not authorized to edit collection focus",
    );
  }
  const row = await selectCollectionById(db, id);
  if (!row) throw new ServiceError("not_found", "Collection entry not found.");
  const updated = await withTransaction(db, async (tx) =>
    updateCollectionFocus(tx, id, clampFocus(focusX), clampFocus(focusY)),
  );
  return { focusX: updated?.focusX ?? 50, focusY: updated?.focusY ?? 50 };
}

export async function generateCatdexThumbnail(
  db: Database,
  id: string,
  attempt: number,
  processor: CatdexThumbnailProcessor = processCatdexThumbnail,
) {
  const snapshot = await withTransaction(db, async (tx) => {
    const [cat] = await tx
      .select()
      .from(catdex)
      .where(eq(catdex.id, id))
      .for("update")
      .limit(1);
    if (
      cat?.thumbnailStatus !== "processing" ||
      cat.thumbnailAttemptCount !== attempt
    ) {
      return { stale: true as const };
    }
    const sourceIds: Array<{
      variant: "default" | "custom";
      id: string;
      name: string | null;
    }> = [];
    if (cat.defaultCardFileId && !cat.defaultCardThumbFileId)
      sourceIds.push({
        variant: "default",
        id: cat.defaultCardFileId,
        name: cat.defaultCardName,
      });
    if (cat.customCardFileId && !cat.customCardThumbFileId)
      sourceIds.push({
        variant: "custom",
        id: cat.customCardFileId,
        name: cat.customCardName,
      });
    if (!sourceIds.length) {
      await tx
        .update(catdex)
        .set({ thumbnailStatus: "complete", updatedAt: new Date() })
        .where(eq(catdex.id, id));
      return { stale: false as const, sources: [] as ThumbnailSource[] };
    }
    const sources: ThumbnailSource[] = [];
    for (const source of sourceIds) {
      const [file] = await tx
        .select({ bytes: files.bytes })
        .from(files)
        .where(eq(files.id, source.id))
        .limit(1);
      sources.push({ ...source, bytes: file?.bytes ?? null });
    }
    return { stale: false as const, sources };
  });
  if (snapshot.stale)
    return { success: false, reason: "stale_attempt" as const };
  if (!snapshot.sources.length)
    return { success: true, generated: [] as string[] };

  const generated: CatdexThumbnailResult[] = [];
  for (const source of snapshot.sources) {
    if (!source.bytes) continue;
    const result = await processor({
      variant: source.variant,
      name: source.name,
      bytes: source.bytes,
    });
    if (result) generated.push(result);
  }

  return withTransaction(db, async (tx) => {
    const [current] = await tx
      .select()
      .from(catdex)
      .where(eq(catdex.id, id))
      .for("update")
      .limit(1);
    if (
      current?.thumbnailStatus !== "processing" ||
      current.thumbnailAttemptCount !== attempt
    )
      return { success: false, reason: "stale_attempt" as const };
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const generatedVariants: string[] = [];
    for (const result of generated) {
      if (
        (result.variant === "default" && current.defaultCardThumbFileId) ||
        (result.variant === "custom" && current.customCardThumbFileId)
      )
        continue;
      const thumb = await storeUploadedFile(tx, result.buffer, "image/jpeg");
      if (result.variant === "default") {
        Object.assign(updates, {
          defaultCardThumbFileId: thumb.id,
          defaultCardThumbName: result.name,
          defaultCardThumbWidth: thumb.width,
          defaultCardThumbHeight: thumb.height,
          defaultCardWidth: result.sourceWidth,
          defaultCardHeight: result.sourceHeight,
        });
      } else {
        Object.assign(updates, {
          customCardThumbFileId: thumb.id,
          customCardThumbName: result.name,
          customCardThumbWidth: thumb.width,
          customCardThumbHeight: thumb.height,
          customCardWidth: result.sourceWidth,
          customCardHeight: result.sourceHeight,
        });
      }
      generatedVariants.push(result.variant);
    }
    const hasDefault = Boolean(
      !current.defaultCardFileId ||
        current.defaultCardThumbFileId ||
        updates.defaultCardThumbFileId,
    );
    const hasCustom = Boolean(
      !current.customCardFileId ||
        current.customCardThumbFileId ||
        updates.customCardThumbFileId,
    );
    Object.assign(updates, {
      thumbnailStatus: hasDefault && hasCustom ? "complete" : "failed",
      thumbnailAttemptedAt: new Date(),
    });
    await tx.update(catdex).set(updates).where(eq(catdex.id, id));
    return { success: true, generated: generatedVariants };
  });
}

export async function enqueueMissingCatdexThumbnails(db: Database, limit = 25) {
  const max = Math.max(1, Math.min(limit, 200));
  const now = new Date();
  const rows = await db
    .select()
    .from(catdex)
    .where(
      sql`(${catdex.thumbnailStatus} is null
        or (${catdex.thumbnailStatus} = 'pending'
          and (${catdex.thumbnailAttemptedAt} is null or ${catdex.thumbnailAttemptedAt} <= ${now}))
        or (${catdex.thumbnailStatus} = 'processing'
          and ${catdex.thumbnailAttemptedAt} <= ${new Date(Date.now() - THUMBNAIL_RETRY_AFTER_MS)}))`,
    )
    .orderBy(
      sql`${catdex.thumbnailAttemptedAt} asc nulls first`,
      catdex.createdAt,
      catdex.id,
    )
    .limit(max);
  let enqueued = 0;
  for (const row of rows) {
    const attempt = (row.thumbnailAttemptCount ?? 0) + 1;
    if (attempt > MAX_THUMBNAIL_ATTEMPTS) continue;
    await withTransaction(db, async (tx) => {
      const updated = await tx.execute<{ id: string }>(sql`
        update catdex set thumbnail_status = 'processing', thumbnail_attempted_at = now(), thumbnail_attempt_count = ${attempt}, updated_at = now()
        where id = ${row.id} and (thumbnail_status is null or thumbnail_status in ('pending', 'processing'))
        returning id
      `);
      if (updated.rows[0]) {
        await enqueueJob(tx, {
          kind: "catdex.thumbnail",
          dedupeKey: row.id,
          payload: { id: row.id, attempt },
        });
        enqueued += 1;
      }
    });
  }
  return { enqueued };
}
