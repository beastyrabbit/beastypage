import "server-only";

import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { Identity } from "../auth/identity";
import {
  ADOPTION_BATCH_MAX_BYTES,
  ADOPTION_BATCH_MAX_CATS,
  adoptionBatchCat,
  adoptionBatchSettingsShape,
  jsonByteLength,
} from "../db/contracts";
import type { Database } from "../db/pool";
import { withTransaction } from "../db/transaction";
import { ServiceError } from "../errors";
import {
  type AdoptionTx,
  findBatch,
  findProfileForCat,
  findUniqueSlug,
  insertBatch,
  insertBatchCats,
  listBatchCats,
  listBatchPageRows,
  listBatches as listBatchRows,
  lockBatch,
  updateBatch,
  updateProfileBatch,
} from "../repositories/adoption";
import { listImageRows } from "../repositories/cats";

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

function tokenMatches(given: string | null | undefined, stored: string | null) {
  if (!given || !stored) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(stored);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type AdoptionCatInput = {
  label: string;
  catData: unknown;
  profileId?: string | null;
  encoded?: string | null;
  shareToken?: string | null;
  editToken?: string | null;
  catName?: string | null;
  creatorName?: string | null;
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

type BatchRow = NonNullable<Awaited<ReturnType<typeof findBatch>>>;

async function toClient(db: Database, row: BatchRow) {
  const cats = await listBatchCats(db, row.id);
  return {
    id: row.id,
    slug: row.slug ?? row.id,
    title: row.title,
    creatorName: row.creatorName,
    settings: row.settings,
    cats: await Promise.all(
      cats.map(async (cat) => {
        const profile = cat.profileId
          ? await findProfileForCat(db, cat.profileId)
          : null;
        const images = profile ? await listImageRows(db, profile.id) : [];
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

async function uniqueBatchSlug(tx: AdoptionTx): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = slug();
    if (!(await findUniqueSlug(tx, candidate))) return candidate;
  }
  throw new ServiceError(
    "conflict",
    "Failed to generate unique slug after several attempts",
  );
}

async function profileRowsForBatch(
  tx: AdoptionTx,
  cats: AdoptionCatInput[],
  identity: Identity,
) {
  const profileRows: Array<Awaited<
    ReturnType<typeof findProfileForCat>
  > | null> = [];
  for (const cat of cats) {
    if (!cat.profileId) {
      profileRows.push(null);
      continue;
    }
    const profile = await findProfileForCat(tx, cat.profileId);
    if (!profile) throw new ServiceError("not_found", "Profile not found");
    const owned = profile.ownerTokenIdentifier === identity.tokenIdentifier;
    if (
      !(profile.ownerTokenIdentifier && owned) &&
      !tokenMatches(cat.editToken, profile.editToken)
    ) {
      throw new ServiceError(
        "forbidden",
        "Not authorized to edit this profile",
      );
    }
    profileRows.push(profile);
  }
  return profileRows;
}

export async function getBatch(db: Database, slugOrId: string) {
  const row = await findBatch(db, slugOrId);
  return row ? toClient(db, row) : null;
}

export async function listBatches(db: Database, limit = 50) {
  const rows = await listBatchRows(db, Math.min(Math.max(limit, 1), 200));
  return Promise.all(rows.map((row) => toClient(db, row)));
}

export async function listBatchesPage(
  db: Database,
  args: { limit?: number; cursor?: string | null },
) {
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
  const page = await listBatchPageRows(db, { limit, cursor: args.cursor });
  return {
    results: await Promise.all(
      page.rows.slice(0, limit).map((row) => toClient(db, row)),
    ),
    nextCursor: page.nextCursor,
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
    const batchSlug = await uniqueBatchSlug(tx);
    const now = new Date();
    const batchEditToken = randomUUID();
    const profileRows = await profileRowsForBatch(tx, args.cats, identity);
    const batch = await insertBatch(tx, {
      slug: batchSlug,
      editToken: batchEditToken,
      ownerTokenIdentifier: identity.tokenIdentifier,
      title: clean(args.title),
      creatorName: clean(args.creatorName),
      settings,
      createdAt: now,
      updatedAt: now,
    });
    if (!batch)
      throw new ServiceError("unavailable", "Failed to create adoption batch");
    await insertBatchCats(
      tx,
      args.cats.map((cat, position) => ({
        batchId: batch.id,
        position,
        label: cat.label,
        catData: cat.catData as Parameters<
          typeof insertBatchCats
        >[1][number]["catData"],
        profileId: profileRows[position]?.id ?? null,
        encoded: clean(cat.encoded),
        shareToken: clean(cat.shareToken),
        editToken: clean(cat.editToken),
        catName: clean(cat.catName),
        creatorName: clean(cat.creatorName),
      })),
    );
    for (const profile of profileRows)
      if (profile) await updateProfileBatch(tx, profile.id, batch.id, now);
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
    const row = await lockBatch(tx, resolved.id);
    if (!row) throw new ServiceError("not_found", "Adoption batch not found");
    if (
      !(
        row.ownerTokenIdentifier &&
        row.ownerTokenIdentifier === identity.tokenIdentifier
      ) &&
      !tokenMatches(args.editToken, row.editToken)
    )
      throw new ServiceError("forbidden", "Not authorized to edit this batch");
    const updated = await updateBatch(tx, row.id, {
      title: clean(args.title),
      creatorName: clean(args.creatorName),
      updatedAt: new Date(),
    });
    return updated ? toClient(db, updated) : null;
  });
}
