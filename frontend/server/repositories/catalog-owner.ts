import "server-only";

import { and, desc, eq, lt, or } from "drizzle-orm";
import type { Database } from "../db/pool";
import { cardSeason, catdex, rarity } from "../db/schema";
import type { PageCursor } from "../pagination";

/** Owner-scoped approved cards used by moderation and owner views. */
export async function selectCatdexByOwner(
  db: Database,
  owner: string,
  cursor: PageCursor | null,
  pageSize: number,
) {
  const cursorWhere = cursor
    ? or(
        lt(catdex.createdAt, new Date(cursor.createdAt)),
        and(
          eq(catdex.createdAt, new Date(cursor.createdAt)),
          lt(catdex.id, cursor.id),
        ),
      )
    : undefined;
  return db
    .select({ cat: catdex, season: cardSeason, rarity })
    .from(catdex)
    .leftJoin(cardSeason, eq(catdex.seasonId, cardSeason.id))
    .leftJoin(rarity, eq(catdex.rarityId, rarity.id))
    .where(
      cursorWhere
        ? and(
            eq(catdex.twitchUserName, owner),
            eq(catdex.approved, true),
            cursorWhere,
          )
        : and(eq(catdex.twitchUserName, owner), eq(catdex.approved, true)),
    )
    .orderBy(desc(catdex.createdAt), desc(catdex.id))
    .limit(pageSize + 1);
}
