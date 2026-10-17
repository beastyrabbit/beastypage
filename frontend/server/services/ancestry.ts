import "server-only";

import {
  pbkdf2Sync,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { Identity } from "../auth/identity";
import { ancestryCats, ancestryTreeConfig } from "../db/contracts";
import type { Database } from "../db/pool";
import { withTransaction } from "../db/transaction";
import { ServiceError } from "../errors";
import {
  deleteTree,
  findTree,
  insertTree,
  listTreePageRows,
  listTrees as listTreeRows,
  lockTree,
  updateTree as updateTreeRow,
} from "../repositories/ancestry";

const MAX_CATS = 500;
const MAX_TREE_BYTES = 900 * 1024;
const MAX_SLUG_LENGTH = 40;
const MAX_NAME_LENGTH = 120;
const PBKDF2_ITERATIONS = 100_000;

export interface TreeSaveInput {
  slug: string;
  name: string;
  foundingMotherId: string;
  foundingFatherId: string;
  cats: unknown[];
  config: unknown;
  creatorName?: string;
  password?: string;
  editToken?: string;
}

function validateTree(
  args: { slug: string; name: string; cats: unknown[]; config: unknown },
  strictSlug = false,
) {
  if (
    args.slug.length === 0 ||
    args.slug.length > MAX_SLUG_LENGTH ||
    (strictSlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(args.slug))
  )
    throw new ServiceError("invalid_input", "Invalid tree slug");
  if (!args.name.trim() || args.name.length > MAX_NAME_LENGTH)
    throw new ServiceError("invalid_input", "Invalid tree name");
  if (args.cats.length > MAX_CATS)
    throw new ServiceError(
      "invalid_input",
      `Tree exceeds the ${MAX_CATS} cat limit`,
    );
  const cats = ancestryCats.safeParse(args.cats);
  if (!cats.success)
    throw new ServiceError("invalid_input", "Invalid tree cats");
  const config = ancestryTreeConfig.safeParse(args.config);
  if (!config.success)
    throw new ServiceError("invalid_input", "Invalid tree config");
  const encoded = JSON.stringify({
    slug: args.slug,
    name: args.name,
    cats: args.cats,
    config: args.config,
  });
  if (new TextEncoder().encode(encoded).byteLength > MAX_TREE_BYTES)
    throw new ServiceError("invalid_input", "Tree payload is too large");
  return { cats: cats.data, config: config.data };
}

function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, "sha256");
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

function legacyHash(value: string) {
  const codeUnitAt = (index: number) => {
    const codePoint = value.codePointAt(index) ?? 0;
    return codePoint <= 0xffff
      ? codePoint
      : 0xd800 + ((codePoint - 0x10000) >> 10);
  };
  const toInt32 = (number: number) => {
    const unsigned = ((Math.trunc(number) % 2 ** 32) + 2 ** 32) % 2 ** 32;
    return unsigned >= 2 ** 31 ? unsigned - 2 ** 32 : unsigned;
  };
  let hash = 0;
  for (let i = 0; i < value.length; i++)
    hash = toInt32(hash * 32 - hash + codeUnitAt(i));
  const salt =
    value.length + (codeUnitAt(0) || 0) + (codeUnitAt(value.length - 1) || 0);
  return `${hash.toString(36)}-${salt.toString(36)}`;
}

function verifyPassword(provided: string, stored: string) {
  if (!stored.startsWith("pbkdf2$")) {
    const a = Buffer.from(legacyHash(provided));
    const b = Buffer.from(stored);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations < 1) return false;
  try {
    const expected = Buffer.from(parts[3], "base64");
    const actual = pbkdf2Sync(
      provided,
      Buffer.from(parts[2], "base64"),
      iterations,
      expected.length,
      "sha256",
    );
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  } catch {
    return false;
  }
}

function tokenMatches(given: string | undefined, stored: string | null) {
  if (!given || !stored) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(stored);
  return a.length === b.length && timingSafeEqual(a, b);
}

type TreeRow = NonNullable<Awaited<ReturnType<typeof findTree>>>;

async function editError(
  row: TreeRow,
  identity: Identity,
  args: { editToken?: string; password?: string },
) {
  if (
    row.ownerTokenIdentifier &&
    row.ownerTokenIdentifier === identity.tokenIdentifier
  )
    return null;
  if (tokenMatches(args.editToken, row.editToken)) return null;
  if (!row.passwordHash) return "edit_token_required" as const;
  if (!args.password) return "password_required" as const;
  return verifyPassword(args.password, row.passwordHash)
    ? null
    : ("invalid_password" as const);
}

function publicTree(row: TreeRow) {
  return {
    _id: row.id,
    id: row.id,
    slug: row.slug,
    name: row.name,
    foundingMotherId: row.foundingMotherId,
    foundingFatherId: row.foundingFatherId,
    cats: row.cats,
    config: row.config,
    creatorName: row.creatorName,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    hasPassword: Boolean(row.passwordHash),
  };
}

export async function getBySlug(db: Database, slug: string) {
  const row = await findTree(db, slug);
  return row ? publicTree(row) : null;
}

export async function checkSlug(db: Database, slug: string) {
  const row = await findTree(db, slug);
  return { exists: Boolean(row), hasPassword: Boolean(row?.passwordHash) };
}

function treeListItem(tree: TreeRow) {
  return {
    id: tree.id,
    slug: tree.slug,
    name: tree.name,
    catCount: tree.cats.length,
    config: tree.config,
    creatorName: tree.creatorName,
    hasPassword: Boolean(tree.passwordHash),
    createdAt: tree.createdAt.getTime(),
    updatedAt: tree.updatedAt.getTime(),
    previewCats: tree.cats
      .slice(0, 6)
      .map((cat) => ({ id: cat.id, name: cat.name.full, params: cat.params })),
  };
}

export async function listTrees(db: Database, limit = 20) {
  const rows = await listTreeRows(db, Math.max(1, Math.min(limit, 100)));
  return rows.map(treeListItem);
}

export async function listTreesPage(
  db: Database,
  args: { limit?: number; cursor?: string | null },
) {
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);
  const page = await listTreePageRows(db, { limit, cursor: args.cursor });
  return {
    results: page.rows.slice(0, limit).map(treeListItem),
    nextCursor: page.nextCursor,
  };
}

async function insertNewTree(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  args: TreeSaveInput,
  identity: Identity,
) {
  const token = randomUUID();
  const row = await insertTree(tx, {
    slug: args.slug,
    name: args.name,
    foundingMotherId: args.foundingMotherId,
    foundingFatherId: args.foundingFatherId,
    cats: args.cats as Parameters<typeof insertTree>[1]["cats"],
    config: args.config as Parameters<typeof insertTree>[1]["config"],
    creatorName: args.creatorName ?? null,
    passwordHash: args.password ? hashPassword(args.password) : null,
    editToken: token,
    ownerTokenIdentifier: identity.tokenIdentifier,
  });
  if (!row)
    throw new ServiceError("unavailable", "Failed to save ancestry tree");
  return { id: row.id, slug: args.slug, isNew: true, editToken: token };
}

export async function saveTree(
  db: Database,
  args: TreeSaveInput,
  identity: Identity,
  asNew = false,
) {
  const validated = validateTree(args);
  if (asNew) validateTree(args, true);
  return withTransaction(db, async (tx) => {
    const existing = await lockTree(tx, args.slug);
    if (existing) {
      if (asNew) return { success: false, error: "slug_taken" } as const;
      const error = await editError(existing, identity, args);
      if (error) return { success: false, error } as const;
      await updateTreeRow(tx, existing.id, {
        name: args.name,
        foundingMotherId: args.foundingMotherId,
        foundingFatherId: args.foundingFatherId,
        cats: validated.cats,
        config: validated.config,
        creatorName: args.creatorName ?? existing.creatorName,
        passwordHash:
          args.password && !existing.passwordHash
            ? hashPassword(args.password)
            : existing.passwordHash,
        updatedAt: new Date(),
      });
      return {
        success: true,
        id: existing.id,
        slug: args.slug,
        isNew: false,
        editToken: existing.editToken,
      } as const;
    }
    validateTree(args, true);
    const created = await insertNewTree(tx, args, identity);
    return { success: true, ...created } as const;
  });
}

export async function updateTree(
  db: Database,
  args: {
    slug: string;
    name?: string;
    cats?: unknown[];
    config?: unknown;
    creatorName?: string;
    password?: string;
    editToken?: string;
  },
  identity: Identity,
) {
  return withTransaction(db, async (tx) => {
    const existing = await lockTree(tx, args.slug);
    if (!existing) return { success: false, error: "not_found" } as const;
    const error = await editError(existing, identity, args);
    if (error) return { success: false, error } as const;
    const next = {
      slug: args.slug,
      name: args.name ?? existing.name,
      cats: args.cats ?? existing.cats,
      config: args.config ?? existing.config,
    };
    const validated = validateTree(next);
    await updateTreeRow(tx, existing.id, {
      name: next.name,
      cats: validated.cats,
      config: validated.config,
      creatorName: args.creatorName ?? existing.creatorName,
      updatedAt: new Date(),
    });
    return {
      success: true,
      id: existing.id,
      slug: args.slug,
      editToken: existing.editToken,
    } as const;
  });
}

export async function removeTree(
  db: Database,
  args: { slug: string; password?: string; editToken?: string },
  identity: Identity,
) {
  return withTransaction(db, async (tx) => {
    const existing = await lockTree(tx, args.slug);
    if (!existing) return { success: false, error: "not_found" } as const;
    const error = await editError(existing, identity, args);
    if (error) return { success: false, error } as const;
    await deleteTree(tx, existing.id);
    return { success: true } as const;
  });
}
