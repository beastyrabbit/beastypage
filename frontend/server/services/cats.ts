import "server-only";

import { randomInt, timingSafeEqual } from "node:crypto";
import type { Identity } from "../auth/identity";
import { catImageMeta, catProfileData } from "../db/contracts";
import type { Database } from "../db/pool";
import { withTransaction } from "../db/transaction";
import { ServiceError } from "../errors";
import type { CatsDb, CatsTx } from "../repositories/cats";
import {
  findImage,
  findProfile,
  findUniqueProfileSlug,
  insertImage,
  insertProfile,
  listImageRows,
  listPreviewRows,
  listProfilePageRows,
  listProfileRows,
  lockProfile,
  updateImage,
  updatePreviewTimestamp,
  updateProfile,
} from "../repositories/cats";

const SLUG_ALPHABET =
  "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const CAT_SLUG_LENGTH = 8;

type ImageReference = {
  url: string;
  name: string | null;
  meta?: unknown;
};
const MAX_SLUG_ATTEMPTS = 6;

export type PreviewPayload = {
  tiny: { url: string; name: string | null } | null;
  preview: { url: string; name: string | null } | null;
  full: { url: string; name: string | null } | null;
  spriteSheet: { url: string; name: string | null; meta: unknown } | null;
  updatedAt: number | null;
};

type ProfileRow = NonNullable<Awaited<ReturnType<typeof findProfile>>>;
type ProfileInsert = Parameters<typeof insertProfile>[1];
type ImageInsert = Parameters<typeof insertImage>[1];

function randomSlug(length: number) {
  let result = "";
  for (let i = 0; i < length; i++)
    result += SLUG_ALPHABET[randomInt(SLUG_ALPHABET.length)];
  return result;
}

function editToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(
    bytes,
    (byte) => SLUG_ALPHABET[byte % SLUG_ALPHABET.length],
  ).join("");
}

function tokenMatches(given: string | undefined, stored: string | null) {
  if (!given || !stored) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(stored);
  return a.length === b.length && timingSafeEqual(a, b);
}

function cleanString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 80) : null;
}

function validateCatData(value: unknown) {
  const parsed = catProfileData.safeParse(value);
  if (!parsed.success)
    throw new ServiceError("invalid_input", "Invalid cat data");
  if (
    typeof parsed.data !== "object" ||
    parsed.data === null ||
    Array.isArray(parsed.data)
  ) {
    throw new ServiceError("invalid_input", "Cat data must be an object");
  }
  const params =
    (parsed.data as Record<string, unknown>).params ??
    (parsed.data as Record<string, unknown>).finalParams;
  if (
    params !== undefined &&
    (typeof params !== "object" || params === null || Array.isArray(params))
  ) {
    throw new ServiceError(
      "invalid_input",
      "Cat data params must be an object",
    );
  }
  return {
    ...(parsed.data as Record<string, unknown>),
    metaLocked: (parsed.data as Record<string, unknown>).metaLocked ?? false,
  };
}

async function uniqueSlug(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
) {
  for (let i = 0; i < MAX_SLUG_ATTEMPTS; i++) {
    const slug = randomSlug(CAT_SLUG_LENGTH);
    if (!(await findUniqueProfileSlug(tx, slug))) return slug;
  }
  throw new ServiceError(
    "conflict",
    "Failed to generate unique slug after several attempts",
  );
}

async function imageRefs(db: CatsDb, profileId: string) {
  const rows = await listImageRows(db, profileId);
  const byKind = new Map(rows.map((row) => [row.kind, row]));
  const build = (
    kind: "tiny" | "preview" | "full" | "spriteSheet",
  ): ImageReference | null => {
    const row = byKind.get(kind);
    if (!row) return null;
    const base = {
      url: `/api/files/${row.fileId}`,
      name: row.filename ?? null,
    };
    return kind === "spriteSheet" ? { ...base, meta: row.meta ?? null } : base;
  };
  return {
    tiny: build("tiny"),
    preview: build("preview"),
    full: build("full"),
    spriteSheet: build("spriteSheet"),
  };
}

async function applyImageUpdate(
  tx: CatsTx,
  profileId: string,
  kind: "tiny" | "preview" | "full" | "spriteSheet",
  payload: { fileId: string; filename?: string; meta?: unknown },
) {
  const checked = catImageMeta.safeParse(payload.meta ?? null);
  if (!checked.success)
    throw new ServiceError("invalid_input", "Invalid image metadata");
  const existing = await findImage(tx, profileId, kind);
  if (existing) {
    await updateImage(tx, existing.id, {
      fileId: payload.fileId,
      updatedAt: new Date(),
      ...(payload.filename !== undefined ? { filename: payload.filename } : {}),
      ...(payload.meta !== undefined ? { meta: checked.data } : {}),
    });
    return;
  }
  await insertImage(tx, {
    catProfileId: profileId,
    kind,
    fileId: payload.fileId,
    filename: payload.filename ?? null,
    meta: checked.data,
  } as ImageInsert);
}

async function toClient(db: CatsDb, row: ProfileRow) {
  const refs = await imageRefs(db, row.id);
  const hasImages = Object.values(refs).some(Boolean);
  return {
    id: row.id,
    shareToken: row.slug,
    slug: row.slug,
    cat_data: row.catData,
    catName: row.catName,
    creatorName: row.creatorName,
    adoptionBatchId: row.adoptionBatchId,
    previews: {
      ...refs,
      updatedAt:
        row.previewsUpdatedAt?.getTime() ?? (hasImages ? Date.now() : null),
    },
    created: row.createdAt.getTime(),
    updated: row.updatedAt.getTime(),
  };
}

export { findProfile };

export async function getProfile(db: Database, slugOrId: string) {
  const row = await findProfile(db, slugOrId);
  return row ? toClient(db, row) : null;
}

export async function createProfile(
  db: Database,
  args: { catData: unknown; catName?: string; creatorName?: string },
  identity: Identity,
) {
  const catData = validateCatData(args.catData);
  return withTransaction(db, async (tx) => {
    const slug = await uniqueSlug(tx);
    const token = editToken();
    const row = await insertProfile(tx, {
      slug,
      catData,
      catName: cleanString(args.catName),
      creatorName: cleanString(args.creatorName),
      editToken: token,
      ownerTokenIdentifier: identity.tokenIdentifier,
    } as ProfileInsert);
    if (!row)
      throw new ServiceError("unavailable", "Failed to create cat profile");
    return { id: row.id, shareToken: slug, slug, editToken: token };
  });
}

async function requireEditor(
  row: ProfileRow,
  identity: Identity,
  supplied?: string,
) {
  if (
    row.ownerTokenIdentifier &&
    row.ownerTokenIdentifier === identity.tokenIdentifier
  )
    return;
  if (tokenMatches(supplied, row.editToken)) return;
  throw new ServiceError("forbidden", "Not authorized to edit this profile");
}

export async function updateProfileMeta(
  db: Database,
  args: {
    id: string;
    catName?: string;
    creatorName?: string;
    editToken?: string;
  },
  identity: Identity,
) {
  const resolved = await findProfile(db, args.id);
  if (!resolved) throw new ServiceError("not_found", "Profile not found");
  return withTransaction(db, async (tx) => {
    const row = await lockProfile(tx, resolved.id);
    if (!row) throw new ServiceError("not_found", "Profile not found");
    await requireEditor(row, identity, args.editToken);
    const data = {
      ...(row.catData as Record<string, unknown>),
      metaLocked: true,
    };
    const updated = await updateProfile(tx, row.id, {
      catData: data,
      updatedAt: new Date(),
      ...(Object.hasOwn(args, "catName")
        ? { catName: cleanString(args.catName) }
        : {}),
      ...(Object.hasOwn(args, "creatorName")
        ? { creatorName: cleanString(args.creatorName) }
        : {}),
    });
    return updated ? toClient(tx, updated) : null;
  });
}

export async function listHistory(db: Database, limit = 200) {
  const rows = await listProfileRows(db, Math.min(Math.max(limit, 1), 500));
  return Promise.all(rows.map((row) => toClient(db, row)));
}

export async function listHistoryPage(
  db: Database,
  args: { limit?: number; cursor?: string | null },
) {
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
  const page = await listProfilePageRows(db, { limit, cursor: args.cursor });
  return {
    results: await Promise.all(
      page.rows.slice(0, limit).map((row) => toClient(db, row)),
    ),
    nextCursor: page.nextCursor,
  };
}

export async function listForPreview(
  db: Database,
  args: { limit: number; staleBefore?: number; force?: boolean },
) {
  const limit = Math.min(Math.max(args.limit, 1), 200);
  const threshold = new Date(
    args.staleBefore ?? Date.now() - 7 * 24 * 60 * 60 * 1000,
  );
  const rows = await listPreviewRows(db);
  return rows
    .filter(
      (row) =>
        args.force ||
        !row.previewsUpdatedAt ||
        row.previewsUpdatedAt <= threshold,
    )
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      catData: row.catData,
      updatedAt: row.previewsUpdatedAt?.getTime() ?? null,
      createdAt: row.createdAt.getTime(),
    }));
}

export async function getPreviewRefs(db: Database, id: string) {
  const row = await findProfile(db, id);
  if (!row) return null;
  const rows = await listImageRows(db, row.id);
  return Object.fromEntries(
    ["tiny", "preview", "full", "spriteSheet"].map((kind) => [
      kind,
      rows.find((entry) => entry.kind === kind) ?? null,
    ]),
  );
}

export async function applyPreviewUpdates(
  db: Database,
  args: {
    id: string;
    previewsUpdatedAt: number;
    images: Partial<
      Record<
        "tiny" | "preview" | "full" | "spriteSheet",
        { fileId: string; filename?: string; meta?: unknown }
      >
    >;
  },
) {
  const resolved = await findProfile(db, args.id);
  if (!resolved) throw new ServiceError("not_found", "Profile not found");
  return withTransaction(db, async (tx) => {
    const row = await lockProfile(tx, resolved.id);
    if (!row) throw new ServiceError("not_found", "Profile not found");
    for (const [kind, payload] of Object.entries(args.images) as [
      "tiny" | "preview" | "full" | "spriteSheet",
      { fileId: string; filename?: string; meta?: unknown } | undefined,
    ][]) {
      if (!payload) continue;
      await applyImageUpdate(tx, row.id, kind, payload);
    }
    await updatePreviewTimestamp(tx, row.id, new Date(args.previewsUpdatedAt));
    const updated = await lockProfile(tx, row.id);
    return updated ? toClient(tx, updated) : null;
  });
}
