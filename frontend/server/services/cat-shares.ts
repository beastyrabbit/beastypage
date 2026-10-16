import "server-only";
import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Identity } from "../auth/identity";
import { catShareData } from "../db/contracts";
import type { Database } from "../db/pool";
import { catShares } from "../db/schema";
import { withTransaction } from "../db/transaction";
import { ServiceError } from "../errors";

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function randomSlug() {
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

export async function getCatShare(db: Database, slug: string) {
  const [row] = await db
    .select()
    .from(catShares)
    .where(eq(catShares.slug, slug))
    .limit(1);
  return row
    ? {
        slug: row.slug,
        data: row.data,
        id: row.id,
        createdAt: row.createdAt.getTime(),
      }
    : null;
}

export async function createCatShare(
  db: Database,
  args: { data: unknown; slug?: string; editToken?: string },
  identity: Identity,
) {
  const parsed = catShareData.safeParse(args.data);
  if (!parsed.success)
    throw new ServiceError("invalid_input", "Invalid share payload");
  return withTransaction(db, async (tx) => {
    const requested = args.slug?.trim();
    if (requested && !/^[A-Za-z0-9]{1,20}$/.test(requested))
      throw new ServiceError("invalid_input", "Invalid slug format");
    if (requested) {
      const [existing] = await tx
        .select()
        .from(catShares)
        .where(eq(catShares.slug, requested))
        .for("update")
        .limit(1);
      if (existing) {
        if (
          !(
            existing.ownerTokenIdentifier &&
            existing.ownerTokenIdentifier === identity.tokenIdentifier
          ) &&
          !tokenMatches(args.editToken, existing.editToken)
        )
          throw new ServiceError("forbidden", "Not authorized to edit share");
        await tx
          .update(catShares)
          .set({ data: parsed.data })
          .where(eq(catShares.id, existing.id));
        return {
          slug: existing.slug,
          id: existing.id,
          updated: true,
          editToken: existing.editToken,
        };
      }
    }
    let chosen = requested;
    for (let attempt = 0; !chosen && attempt < 6; attempt++) {
      const candidate = randomSlug();
      const [existing] = await tx
        .select({ id: catShares.id })
        .from(catShares)
        .where(eq(catShares.slug, candidate))
        .limit(1);
      if (!existing) chosen = candidate;
    }
    if (!chosen)
      throw new ServiceError(
        "conflict",
        "Failed to generate unique share slug",
      );
    const editToken = randomUUID();
    const [row] = await tx
      .insert(catShares)
      .values({
        slug: chosen,
        data: parsed.data,
        editToken,
        ownerTokenIdentifier: identity.tokenIdentifier,
      })
      .returning({ id: catShares.id });
    if (!row)
      throw new ServiceError("unavailable", "Failed to create cat share");
    return { slug: chosen, id: row.id, updated: false, editToken };
  });
}
