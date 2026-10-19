import "server-only";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { PerfectCatParams } from "../db/contracts";
import type { Database } from "../db/pool";
import { perfectCats } from "../db/schema";
import { withTransaction } from "../db/transaction";
import { ServiceError } from "../errors";
import {
  countActiveMatchups,
  countRecentSpins,
  deleteExpiredMatchups,
  deleteMatchup,
  insertMatchup,
  insertPerfectCat,
  insertScore,
  insertSpin,
  insertVote,
  listPerfectLeaderboard,
  listScores,
  listSpins,
  lockMatchupForClient,
  lockPerfectCat,
  lockSpinActor,
  replaceMatchup,
  selectExpiredMatchups,
  selectPerfectCatByHash,
  selectPerfectPool,
  selectRecentVotes,
} from "../repositories/games";

const INITIAL_RATING = 1500;
const K_FACTOR = 24;
const MINIMUM_POOL_SIZE = 16;
const COUNT_SAMPLE_LIMIT = 256;
const MAX_REGISTERED_CATS = 32;
const MAX_PARAMS_BYTES = 32 * 1024;
const MATCHUP_TTL_MS = 15 * 60 * 1000;
const MAX_ACTIVE_MATCHUPS = 600;
const ANONYMOUS_SPINS_PER_MINUTE = 30;
const AUTHENTICATED_SPINS_PER_MINUTE = 60;

function stableStringify(value: unknown): string {
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "string"
  )
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort(compareCodeUnits)
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function compareCodeUnits(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function hashCatParams(params: unknown): string {
  const input = stableStringify(params);
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
    hash >>>= 0;
  }
  return hash.toString(16);
}

function validClientId(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128 || normalized !== value)
    throw new ServiceError("invalid_input", "A valid client ID is required");
  return normalized;
}

function sanitizeCat(cat: typeof perfectCats.$inferSelect) {
  return {
    id: cat.id,
    rating: cat.rating,
    wins: cat.wins,
    losses: cat.losses,
    appearances: cat.appearances,
    params: cat.params,
  };
}

function pairKey(left: string, right: string) {
  return [left, right].sort(compareCodeUnits).join("__");
}

function chooseRandom<T>(values: T[]): T | null {
  return values.length
    ? (values[Math.floor(Math.random() * values.length)] ?? null)
    : null;
}

function mapPool(rows: Array<typeof perfectCats.$inferSelect>) {
  const map = new Map<string, typeof perfectCats.$inferSelect>();
  for (const row of rows) map.set(row.id, row);
  return [...map.values()];
}

function chooseSecond(
  pool: Array<typeof perfectCats.$inferSelect>,
  first: typeof perfectCats.$inferSelect,
  seen: Set<string>,
) {
  const candidates = pool.filter(
    (row) =>
      row.id !== first.id &&
      (!seen.has(pairKey(first.id, row.id)) || pool.length <= 2),
  );
  return chooseRandom(
    candidates.length ? candidates : pool.filter((row) => row.id !== first.id),
  );
}

export async function registerPerfectCats(
  db: Database,
  cats: Array<{ params: PerfectCatParams }>,
) {
  if (cats.length === 0 || cats.length > MAX_REGISTERED_CATS)
    throw new ServiceError(
      "invalid_input",
      `Register between 1 and ${MAX_REGISTERED_CATS} cats`,
    );
  return withTransaction(db, async (tx) => {
    const result = [];
    for (const entry of cats) {
      const encoded = JSON.stringify(entry.params);
      if (
        !encoded ||
        new TextEncoder().encode(encoded).byteLength > MAX_PARAMS_BYTES
      )
        throw new ServiceError("invalid_input", "Cat parameters are too large");
      const hash = hashCatParams(entry.params);
      const existing = await selectPerfectCatByHash(tx, hash);
      if (existing) {
        result.push(sanitizeCat(existing));
        continue;
      }
      const now = new Date();
      const inserted = await insertPerfectCat(tx, {
        hash,
        params: entry.params,
        rating: INITIAL_RATING,
        wins: 0,
        losses: 0,
        appearances: 0,
        lastShownAt: now,
        createdAt: now,
        updatedAt: now,
      });
      const resolved = inserted ?? (await selectPerfectCatByHash(tx, hash));
      if (resolved) result.push(sanitizeCat(resolved));
    }
    return result;
  });
}

export async function requestPerfectMatchup(db: Database, clientValue: string) {
  const clientId = validClientId(clientValue);
  return withTransaction(
    db,
    async (tx) => {
      const { all, top, recent } = await selectPerfectPool(tx);
      const totalCats = Math.min(all.length, COUNT_SAMPLE_LIMIT);
      const pool = mapPool([...top, ...recent, ...all.slice(0, 40)]);
      const needsSeed = Math.max(0, MINIMUM_POOL_SIZE - totalCats);
      if (totalCats < 2 || pool.length < 2)
        return { cats: [], needsSeed, totalCats, clientId };
      const votes = await selectRecentVotes(tx, clientId);
      const seen = new Set(
        votes.map((vote) => pairKey(vote.catAId, vote.catBId)),
      );
      const first = chooseRandom(pool);
      const second = first ? chooseSecond(pool, first, seen) : null;
      if (!first || !second)
        return { cats: [], needsSeed, totalCats, clientId };
      const now = new Date();
      const previous = await lockMatchupForClient(tx, clientId);
      if (!previous) {
        const active = await countActiveMatchups(tx, now);
        if (active >= MAX_ACTIVE_MATCHUPS)
          throw new ServiceError(
            "unavailable",
            "Perfect Cat matchups are temporarily full",
          );
      }
      const values = {
        clientId,
        catAId: first.id,
        catBId: second.id,
        token: randomUUID(),
        expiresAt: new Date(now.getTime() + MATCHUP_TTL_MS),
        consumed: false,
        createdAt: now,
      };
      const row = previous
        ? await replaceMatchup(tx, previous.id, values)
        : await insertMatchup(tx, values);
      return {
        cats: [sanitizeCat(first), sanitizeCat(second)],
        needsSeed,
        totalCats,
        totalCatsCapped: all.length > COUNT_SAMPLE_LIMIT,
        clientId,
        matchupToken: row?.token,
      };
    },
    { isolation: "serializable", retries: 8 },
  );
}

export async function submitPerfectVote(
  db: Database,
  args: {
    clientId: string;
    winnerId: string;
    loserId: string;
    matchupToken: string;
  },
) {
  const clientId = validClientId(args.clientId);
  if (args.winnerId === args.loserId)
    throw new ServiceError(
      "invalid_input",
      "Winner and loser must be different cats",
    );
  return withTransaction(
    db,
    async (tx) => {
      const matchup = await lockMatchupForClient(tx, clientId);
      const now = new Date();
      const winner = await lockPerfectCat(tx, args.winnerId);
      const loser = await lockPerfectCat(tx, args.loserId);
      if (!winner || !loser)
        throw new ServiceError("not_found", "One of the cats no longer exists");
      if (
        !matchup ||
        matchup.consumed ||
        matchup.expiresAt < now ||
        pairKey(matchup.catAId, matchup.catBId) !==
          pairKey(winner.id, loser.id) ||
        args.matchupToken !== matchup.token
      )
        throw new ServiceError(
          "forbidden",
          "Vote requires the current unused matchup",
        );
      await deleteMatchup(tx, matchup.id);
      const expectedWinner =
        1 / (1 + 10 ** ((loser.rating - winner.rating) / 400));
      const expectedLoser =
        1 / (1 + 10 ** ((winner.rating - loser.rating) / 400));
      const winnerRating = winner.rating + K_FACTOR * (1 - expectedWinner);
      const loserRating = loser.rating + K_FACTOR * (0 - expectedLoser);
      await tx
        .update(perfectCats)
        .set({
          rating: winnerRating,
          wins: winner.wins + 1,
          appearances: winner.appearances + 1,
          updatedAt: now,
          lastShownAt: now,
        })
        .where(eq(perfectCats.id, winner.id));
      await tx
        .update(perfectCats)
        .set({
          rating: loserRating,
          losses: loser.losses + 1,
          appearances: loser.appearances + 1,
          updatedAt: now,
          lastShownAt: now,
        })
        .where(eq(perfectCats.id, loser.id));
      await insertVote(tx, {
        catAId: winner.id,
        catBId: loser.id,
        winnerId: winner.id,
        clientId,
        createdAt: now,
      });
      return {
        winner: { id: winner.id, rating: winnerRating },
        loser: { id: loser.id, rating: loserRating },
      };
    },
    { isolation: "serializable", retries: 8 },
  );
}

export async function perfectLeaderboard(db: Database, limit?: number) {
  const bounded = Math.max(1, Math.min(limit ?? 20, 100));
  return (await listPerfectLeaderboard(db, bounded)).map(sanitizeCat);
}

export async function cleanupPerfectMatchups(db: Database) {
  return withTransaction(db, async (tx) => {
    const rows = await selectExpiredMatchups(tx, 100);
    await deleteExpiredMatchups(
      tx,
      rows.map((row) => row.id),
    );
    return { deleted: rows.length };
  });
}

function sanitizeName(raw: string) {
  return raw.trim().slice(0, 12);
}

export async function coinflipLeaderboard(db: Database, limit?: number) {
  const bounded = limit && limit > 0 ? Math.min(limit, 50) : 10;
  return (await listScores(db, bounded)).map((row) => ({
    id: row.id,
    name: row.playerName,
    score: row.score,
    createdAt: row.createdAt.getTime(),
  }));
}

export async function coinflipScores(db: Database, limit?: number) {
  const bounded = limit && limit > 0 ? Math.min(limit, 500) : 200;
  return (await listScores(db, bounded)).map((row) => ({
    id: row.id,
    name: row.playerName,
    score: row.score,
    createdAt: row.createdAt.getTime(),
  }));
}

export async function submitCoinflipScore(
  db: Database,
  args: { name: string; score: number },
) {
  const name = sanitizeName(args.name);
  if (!name) throw new ServiceError("invalid_input", "Name must be provided");
  const score = Number.isFinite(args.score) ? Math.floor(args.score) : 0;
  if (score <= 0)
    throw new ServiceError("invalid_input", "Score must be greater than zero");
  const row = await withTransaction(db, (tx) =>
    insertScore(tx, { playerName: name, score, createdAt: new Date() }),
  );
  return {
    id: row.id,
    name: row.playerName,
    score: row.score,
    createdAt: row.createdAt.getTime(),
  };
}

const wheelPrizes = [
  ["Moondust", 40],
  ["Starborn", 25],
  ["Lunara", 15],
  ["Celestara", 10],
  ["Divinara", 6],
  ["Holo Nova", 3],
  ["Singularity", 1],
] as const;

function prizeForBucket(bucket: number) {
  let cumulative = 0;
  for (const [name, chance] of wheelPrizes) {
    cumulative += chance;
    if (bucket < cumulative) return name;
  }
  return wheelPrizes.at(-1)?.[0];
}

export async function logWheelSpin(
  db: Database,
  args: {
    prizeName: string;
    forced: boolean;
    randomBucket?: number;
    clientKey?: string;
  },
  tokenIdentifier?: string | null,
) {
  if (args.forced)
    throw new ServiceError("forbidden", "Forced wheel spins are internal-only");
  const clientKey =
    !tokenIdentifier &&
    args.clientKey &&
    /^[A-Za-z0-9_-]{16,80}$/.test(args.clientKey)
      ? args.clientKey
      : null;
  const actorKey =
    tokenIdentifier ?? (clientKey ? `anonymous:${clientKey}` : "anonymous");
  const rateLimit = tokenIdentifier
    ? AUTHENTICATED_SPINS_PER_MINUTE
    : ANONYMOUS_SPINS_PER_MINUTE;
  if (args.randomBucket === undefined)
    throw new ServiceError("invalid_input", "A random bucket is required");
  if (!wheelPrizes.some(([name]) => name === args.prizeName))
    throw new ServiceError("invalid_input", "Unknown wheel prize");
  if (
    !Number.isInteger(args.randomBucket) ||
    args.randomBucket < 0 ||
    args.randomBucket >= 100
  )
    throw new ServiceError("invalid_input", "Invalid wheel random bucket");
  if (prizeForBucket(args.randomBucket) !== args.prizeName)
    throw new ServiceError(
      "invalid_input",
      "Prize does not match random bucket",
    );
  await withTransaction(
    db,
    async (tx) => {
      await lockSpinActor(tx, actorKey);
      const count = await countRecentSpins(
        tx,
        actorKey,
        new Date(Date.now() - 60_000),
      );
      if (count >= rateLimit)
        throw new ServiceError(
          "rate_limited",
          "Wheel spin rate limit exceeded; try again shortly",
        );
      await insertSpin(tx, {
        prizeName: args.prizeName,
        forced: false,
        randomBucket: args.randomBucket,
        actorKey,
        createdAt: new Date(),
      });
    },
    { isolation: "serializable", retries: 8 },
  );
}

export async function wheelStats(db: Database, limit?: number) {
  const bounded = Math.max(1, Math.min(limit ?? 2_000, 10_000));
  const rows = await listSpins(db, bounded);
  const records = rows.slice(0, bounded);
  const totals = new Map<
    string,
    { count: number; forcedCount: number; lastSpinAt: number | null }
  >();
  let totalSpins = 0;
  let totalForced = 0;
  let lastSpinAt: number | null = null;
  for (const row of records) {
    const current = totals.get(row.prizeName) ?? {
      count: 0,
      forcedCount: 0,
      lastSpinAt: null,
    };
    if (row.forced) {
      totalForced += 1;
      current.forcedCount += 1;
    } else {
      totalSpins += 1;
      lastSpinAt = Math.max(lastSpinAt ?? 0, row.createdAt.getTime());
      current.count += 1;
    }
    current.lastSpinAt = Math.max(
      current.lastSpinAt ?? 0,
      row.createdAt.getTime(),
    );
    totals.set(row.prizeName, current);
  }
  return {
    totalSpins,
    totalForced,
    lastSpinAt,
    sampleSize: records.length,
    truncated: rows.length > bounded,
    prizes: [...totals.entries()].map(([prizeName, info]) => ({
      prizeName,
      ...info,
    })),
  };
}
