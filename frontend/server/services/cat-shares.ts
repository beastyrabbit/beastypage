import "server-only";

import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { Identity } from "../auth/identity";
import { catShareData } from "../db/contracts";
import type { Database } from "../db/pool";
import { withTransaction } from "../db/transaction";
import { ServiceError } from "../errors";
import {
  findShare,
  findUniqueSlug,
  insertShare,
  updateShare,
} from "../repositories/catShares";

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const MAX_DATA_BYTES = 256 * 1024;

function slug() {
  let result = "";
  for (let i = 0; i < 7; i++) result += ALPHABET[randomInt(ALPHABET.length)];
  return result;
}

function tokenMatches(given: string | undefined, stored: string | null) {
  if (!given || !stored) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(stored);
  return a.length === b.length && timingSafeEqual(a, b);
}

function validateData(data: unknown) {
  let bytes: number;
  try {
    const encoded = JSON.stringify(data);
    if (!encoded) throw new Error("not serializable");
    bytes = new TextEncoder().encode(encoded).byteLength;
  } catch {
    throw new ServiceError("invalid_input", "Invalid share payload");
  }
  if (bytes > MAX_DATA_BYTES)
    throw new ServiceError("invalid_input", "Share payload is too large");
  const parsed = catShareData.safeParse(data);
  if (!parsed.success)
    throw new ServiceError("invalid_input", "Invalid share payload");
  return parsed.data;
}

type ShareRow = NonNullable<Awaited<ReturnType<typeof findShare>>>;

export async function getCatShare(db: Database, slugValue: string) {
  const row = await findShare(db, slugValue);
  if (!row) return null;
  return {
    slug: row.slug,
    data: row.data,
    id: row.id,
    createdAt: row.createdAt.getTime(),
  };
}

export async function createCatShare(
  db: Database,
  args: { data: unknown; slug?: string; editToken?: string },
  identity: Identity,
) {
  const data = validateData(args.data);
  const requestedSlug = args.slug?.trim();
  if (requestedSlug && !/^[A-Za-z0-9]{1,20}$/.test(requestedSlug))
    throw new ServiceError("invalid_input", "Invalid slug format");
  return withTransaction(db, async (tx) => {
    if (requestedSlug) {
      const existing = await findShare(tx, requestedSlug);
      if (existing) {
        const owned =
          !!existing.ownerTokenIdentifier &&
          identity.tokenIdentifier === existing.ownerTokenIdentifier;
        if (!owned && !tokenMatches(args.editToken, existing.editToken))
          throw new ServiceError("forbidden", "Not authorized to edit share");
        await updateShare(tx, existing.id, { data });
        return {
          slug: existing.slug,
          id: existing.id,
          updated: true,
          editToken: existing.editToken,
        };
      }
    }
    let chosen = requestedSlug ?? "";
    if (!chosen) {
      for (let attempt = 0; attempt < 6; attempt++) {
        const candidate = slug();
        if (!(await findUniqueSlug(tx, candidate))) {
          chosen = candidate;
          break;
        }
      }
    }
    if (!chosen)
      throw new ServiceError(
        "conflict",
        "Failed to generate unique share slug",
      );
    const editToken = randomUUID();
    const row = await insertShare(tx, {
      slug: chosen,
      data,
      editToken,
      ownerTokenIdentifier: identity.tokenIdentifier,
      createdAt: new Date(),
    });
    if (!row)
      throw new ServiceError("unavailable", "Failed to create cat share");
    return { slug: chosen, id: row.id, updated: false, editToken };
  });
}

export type CatShareRow = ShareRow;
