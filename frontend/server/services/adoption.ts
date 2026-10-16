import "server-only";
import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { and, desc, eq, lt, or } from "drizzle-orm";
import type { Identity } from "../auth/identity";
import {
  ADOPTION_BATCH_MAX_BYTES,
  ADOPTION_BATCH_MAX_CATS,
  adoptionBatchCat,
  adoptionBatchSettingsShape,
  jsonByteLength,
} from "../db/contracts";
import type { Database } from "../db/pool";
import {
  adoptionBatch,
  adoptionBatchCats,
  catImages,
  catProfile,
} from "../db/schema";
import { withTransaction } from "../db/transaction";
import { ServiceError } from "../errors";
import { decodeCursor, encodeCursor } from "../pagination";
import { isUuid } from "../repositories/legacyLinks";
import { findProfile } from "./cats";

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function slug() {
  let value = "";
  for (let i = 0; i < 9; i++) value += ALPHABET[randomInt(ALPHABET.length)];
  return value;
}

function clean(value: unknown) {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result ? result.slice(0, 80) : null;
}

function tokenMatches(given: string | undefined, stored: string | null) {
  if (!given || !stored) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(stored);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type AdoptionCatInput = {
  label: string;
  catData: unknown;
  profileId?: string;
  encoded?: string;
  shareToken?: string;
  editToken?: string;
  catName?: string;
  creatorName?: string;
};

function validateCats(cats: AdoptionCatInput[], settings: unknown) {
  if (!cats.length)
    throw new ServiceError(
      "invalid_input",
      "At least one cat is required to create an adoption batch",
    );
  if (cats.length > ADOPTION_BATCH_MAX_CATS)
    throw new ServiceError(
      "invalid_input",
      `A batch may contain at most ${ADOPTION_BATCH_MAX_CATS} cats`,
    );
  for (const [index, cat] of cats.entries()) {
    const parsed = adoptionBatchCat.safeParse(cat);
    if (!parsed.success)
      throw new ServiceError("invalid_input", `Invalid cat at index ${index}`);
  }
  const parsedSettings =
    settings === undefined
      ? undefined
      : adoptionBatchSettingsShape.safeParse(settings);
  if (settings !== undefined && !parsedSettings?.success)
    throw new ServiceError("invalid_input", "Invalid adoption batch settings");
  if (jsonByteLength({ cats, settings }) > ADOPTION_BATCH_MAX_BYTES)
    throw new ServiceError(
      "invalid_input",
      "Adoption batch payload is too large",
    );
  return parsedSettings?.success ? parsedSettings.data : undefined;
}

async function toClient(db: Database, row: typeof adoptionBatch.$inferSelect) {
  const cats = await db
    .select()
    .from(adoptionBatchCats)
    .where(eq(adoptionBatchCats.batchId, row.id))
    .orderBy(adoptionBatchCats.position);
  return {
    id: row.id,
    slug: row.slug ?? row.id,
    title: row.title,
    creatorName: row.creatorName,
    settings: row.settings,
    cats: await Promise.all(
      cats.map(async (cat) => {
        const profile = cat.profileId
          ? await findProfile(db, cat.profileId)
          : null;
        const images = profile
          ? await db
              .select({
                kind: catImages.kind,
                fileId: catImages.fileId,
                filename: catImages.filename,
                meta: catImages.meta,
              })
              .from(catImages)
              .where(eq(catImages.catProfileId, profile.id))
          : [];
        const image = (kind: string) =>
          images.find((item) => item.kind === kind);
        const make = (kind: "tiny" | "preview" | "full" | "spriteSheet") => {
          const item = image(kind);
          if (!item) return null;
          const base = {
            url: `/api/files/${item.fileId}`,
            name: item.filename ?? null,
          };
          return kind === "spriteSheet"
            ? { ...base, meta: item.meta ?? null }
            : base;
        };
        return {
          index: cat.position,
          label: cat.label,
          catData: cat.catData,
          profileId: cat.profileId ?? profile?.id ?? null,
          encoded: cat.encoded,
          shareToken: cat.shareToken ?? profile?.slug ?? null,
          catName: cat.catName ?? profile?.catName ?? null,
          creatorName: cat.creatorName ?? profile?.creatorName ?? null,
          previews: {
            tiny: make("tiny"),
            preview: make("preview"),
            full: make("full"),
            spriteSheet: make("spriteSheet"),
            updatedAt: profile?.previewsUpdatedAt?.getTime() ?? null,
          },
        };
      }),
    ),
    created: row.createdAt.getTime(),
    updated: row.updatedAt.getTime(),
  };
}

async function findBatch(db: Database, slugOrId: string) {
  const [bySlug] = await db
    .select()
    .from(adoptionBatch)
    .where(eq(adoptionBatch.slug, slugOrId))
    .limit(1);
  if (bySlug) return bySlug;
  const [legacy] = await db
    .select()
    .from(adoptionBatch)
    .where(eq(adoptionBatch.legacyId, slugOrId))
    .limit(1);
  if (legacy) return legacy;
  if (!isUuid(slugOrId)) return null;
  const [byId] = await db
    .select()
    .from(adoptionBatch)
    .where(eq(adoptionBatch.id, slugOrId))
    .limit(1);
  return byId ?? null;
}

export async function getBatch(db: Database, slugOrId: string) {
  const row = await findBatch(db, slugOrId);
  return row ? toClient(db, row) : null;
}

export async function listBatches(db: Database, limit = 50) {
  const rows = await db
    .select()
    .from(adoptionBatch)
    .orderBy(desc(adoptionBatch.createdAt))
    .limit(Math.min(Math.max(limit, 1), 200));
  return Promise.all(rows.map((row) => toClient(db, row)));
}

export async function listBatchesPage(
  db: Database,
  args: { limit?: number; cursor?: string | null },
) {
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
  const cursor = decodeCursor(args.cursor);
  const where = cursor
    ? or(
        lt(adoptionBatch.createdAt, new Date(cursor.createdAt)),
        and(
          eq(adoptionBatch.createdAt, new Date(cursor.createdAt)),
          lt(adoptionBatch.id, cursor.id),
        ),
      )
    : undefined;
  const rows = await db
    .select()
    .from(adoptionBatch)
    .where(where)
    .orderBy(desc(adoptionBatch.createdAt), desc(adoptionBatch.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  return {
    results: await Promise.all(page.map((row) => toClient(db, row))),
    nextCursor: rows.length > limit ? encodeCursor(rows[limit - 1]) : null,
  };
}

export async function createBatch(
  db: Database,
  args: {
    cats: AdoptionCatInput[];
    title?: string;
    creatorName?: string;
    settings?: unknown;
  },
  identity: Identity,
) {
  const settings = validateCats(args.cats, args.settings);
  return withTransaction(db, async (tx) => {
    let batchSlug = "";
    for (let attempt = 0; attempt < 6; attempt++) {
      const candidate = slug();
      const [existing] = await tx
        .select({ id: adoptionBatch.id })
        .from(adoptionBatch)
        .where(eq(adoptionBatch.slug, candidate))
        .limit(1);
      if (!existing) {
        batchSlug = candidate;
        break;
      }
    }
    if (!batchSlug)
      throw new ServiceError(
        "conflict",
        "Failed to generate unique slug after several attempts",
      );
    const now = new Date();
    const batchEditToken = randomUUID();
    const profileRows: Array<typeof catProfile.$inferSelect | null> = [];
    for (const cat of args.cats) {
      if (!cat.profileId) {
        profileRows.push(null);
        continue;
      }
      const profile = await findProfile(db, cat.profileId);
      if (!profile) throw new ServiceError("not_found", "Profile not found");
      if (
        !(
          profile.ownerTokenIdentifier &&
          profile.ownerTokenIdentifier === identity.tokenIdentifier
        ) &&
        !tokenMatches(cat.editToken, profile.editToken)
      )
        throw new ServiceError(
          "forbidden",
          "Not authorized to edit this profile",
        );
      profileRows.push(profile);
    }
    const [batch] = await tx
      .insert(adoptionBatch)
      .values({
        slug: batchSlug,
        editToken: batchEditToken,
        ownerTokenIdentifier: identity.tokenIdentifier,
        title: clean(args.title),
        creatorName: clean(args.creatorName),
        settings,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: adoptionBatch.id });
    if (!batch)
      throw new ServiceError("unavailable", "Failed to create adoption batch");
    await tx.insert(adoptionBatchCats).values(
      args.cats.map((cat, position) => ({
        batchId: batch.id,
        position,
        label: cat.label,
        catData: cat.catData as typeof adoptionBatchCats.$inferInsert.catData,
        profileId: profileRows[position]?.id ?? null,
        encoded: clean(cat.encoded),
        shareToken: clean(cat.shareToken),
        editToken: clean(cat.editToken),
        catName: clean(cat.catName),
        creatorName: clean(cat.creatorName),
      })),
    );
    for (const profile of profileRows)
      if (profile)
        await tx
          .update(catProfile)
          .set({ adoptionBatchId: batch.id, updatedAt: now })
          .where(eq(catProfile.id, profile.id));
    return {
      id: batch.id,
      slug: batchSlug,
      shareToken: batchSlug,
      editToken: batchEditToken,
    };
  });
}

export async function updateBatchMeta(
  db: Database,
  args: {
    id: string;
    editToken?: string;
    title?: string;
    creatorName?: string;
  },
  identity: Identity,
) {
  const resolved = await findBatch(db, args.id);
  if (!resolved)
    throw new ServiceError("not_found", "Adoption batch not found");
  return withTransaction(db, async (tx) => {
    const [row] = await tx
      .select()
      .from(adoptionBatch)
      .where(eq(adoptionBatch.id, resolved.id))
      .for("update")
      .limit(1);
    if (!row) throw new ServiceError("not_found", "Adoption batch not found");
    if (
      !(
        row.ownerTokenIdentifier &&
        row.ownerTokenIdentifier === identity.tokenIdentifier
      ) &&
      !tokenMatches(args.editToken, row.editToken)
    )
      throw new ServiceError("forbidden", "Not authorized to edit this batch");
    await tx
      .update(adoptionBatch)
      .set({
        title: clean(args.title),
        creatorName: clean(args.creatorName),
        updatedAt: new Date(),
      })
      .where(eq(adoptionBatch.id, row.id));
    const [updated] = await tx
      .select()
      .from(adoptionBatch)
      .where(eq(adoptionBatch.id, row.id))
      .limit(1);
    return updated ? toClient(db, updated) : null;
  });
}
