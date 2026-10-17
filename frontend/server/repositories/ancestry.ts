import "server-only";

import { desc, eq } from "drizzle-orm";
import type { Database } from "../db/pool";
import { ancestryTree } from "../db/schema";
import {
  createdAtOrderBefore,
  creationTimestamp,
  decodeCursor,
  encodeCursor,
  rowCreationTimestamp,
} from "../pagination";

export type AncestryTx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type AncestryDb = Database | AncestryTx;

export async function findTree(db: AncestryDb, slug: string) {
  const [row] = await db
    .select()
    .from(ancestryTree)
    .where(eq(ancestryTree.slug, slug))
    .limit(1);
  return row ?? null;
}

export async function listTrees(db: AncestryDb, limit: number) {
  return db
    .select()
    .from(ancestryTree)
    .orderBy(
      desc(ancestryTree.createdAt),
      desc(creationTimestamp(ancestryTree)),
      desc(ancestryTree.id),
    )
    .limit(limit);
}

export async function listTreePageRows(
  db: AncestryDb,
  args: { limit: number; cursor?: string | null },
) {
  const cursor = decodeCursor(args.cursor);
  const where = cursor ? createdAtOrderBefore(ancestryTree, cursor) : undefined;
  const rows = await db
    .select()
    .from(ancestryTree)
    .where(where)
    .orderBy(
      desc(ancestryTree.createdAt),
      desc(creationTimestamp(ancestryTree)),
      desc(ancestryTree.id),
    )
    .limit(args.limit + 1);
  return {
    rows,
    nextCursor:
      rows.length > args.limit
        ? encodeCursor({
            createdAt: rows[args.limit - 1].createdAt,
            creationAt: rowCreationTimestamp(rows[args.limit - 1]),
            id: rows[args.limit - 1].id,
          })
        : null,
  };
}

export async function lockTree(tx: AncestryTx, slug: string) {
  const [row] = await tx
    .select()
    .from(ancestryTree)
    .where(eq(ancestryTree.slug, slug))
    .for("update")
    .limit(1);
  return row ?? null;
}

export async function insertTree(
  tx: AncestryTx,
  values: typeof ancestryTree.$inferInsert,
) {
  const [row] = await tx.insert(ancestryTree).values(values).returning();
  return row ?? null;
}

export async function updateTree(
  tx: AncestryTx,
  id: string,
  values: Partial<typeof ancestryTree.$inferInsert>,
) {
  await tx.update(ancestryTree).set(values).where(eq(ancestryTree.id, id));
}

export async function deleteTree(tx: AncestryTx, id: string) {
  await tx.delete(ancestryTree).where(eq(ancestryTree.id, id));
}
