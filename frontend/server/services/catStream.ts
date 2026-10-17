import "server-only";

import { timingSafeEqual } from "node:crypto";
import {
  buildStreamWheelUpdate,
  pickStreamWheelSpin,
} from "../../convex/streamWheel";
import type { Identity } from "../auth/identity";
import { catStreamCommand, catStreamSettings } from "../db/contracts";
import type { Database } from "../db/pool";
import type { catStreamSessions } from "../db/schema";
import type { Transaction } from "../db/transaction";
import { withTransaction } from "../db/transaction";
import { ServiceError } from "../errors";
import { enqueueJob } from "../jobs/enqueue";
import { publishLive } from "../live/publish";
import {
  bumpCatStreamRevision,
  insertCatStreamSession,
  insertWheelSpin,
  selectCatStreamSession,
  selectCatStreamSessionByUser,
  selectCatStreamSessionByUserForUpdate,
  selectCatStreamSessionForUpdate,
  updateCatStreamSession,
} from "../repositories/catStream";
import {
  getUserByApiKey,
  getUserByTokenIdentifier,
} from "../repositories/users";
import { findUserByApiKey } from "./users";

export const VERDICT_MS = 3_000;
export const VERDICT_GRACE_MS = 10_000;
export const HOLD_MAX_MS = 90_000;

type CatSession = typeof catStreamSessions.$inferSelect;

function settingsValue(value: unknown) {
  const parsed = catStreamSettings.safeParse(value ?? {});
  if (!parsed.success)
    throw new ServiceError("invalid_input", "Invalid stream settings");
  return parsed.data;
}

function commandValue(value: unknown) {
  const parsed = catStreamCommand.safeParse(value);
  if (!parsed.success)
    throw new ServiceError("invalid_input", "Invalid stream command");
  return parsed.data;
}

function millis(value: Date | null | undefined) {
  return value?.getTime() ?? 0;
}

function record(row: CatSession) {
  return {
    id: row.id,
    userId: row.userId,
    status: row.status,
    settings: row.settings,
    currentCommand: row.currentCommand ?? null,
    testMode: row.testMode,
    lastWheelSpinForSeq: row.lastWheelSpinForSeq ?? undefined,
    batchState: row.batchState ?? null,
    evolutionState: row.evolutionState ?? null,
    revision: row.revision ?? 0,
    createdAt: millis(row.createdAt),
    updatedAt: millis(row.updatedAt),
  };
}

function requireIdentity(identity: Identity) {
  if (!identity.tokenIdentifier)
    throw new ServiceError("forbidden", "Not authenticated");
}

async function hostSession(tx: Transaction, identity: Identity) {
  requireIdentity(identity);
  const user = await getUserByTokenIdentifier(
    tx,
    identity.tokenIdentifier as string,
  );
  if (!user) throw new ServiceError("not_found", "User not found");
  const session = await selectCatStreamSessionByUserForUpdate(tx, user.id);
  if (!session) throw new ServiceError("not_found", "No stream session found");
  return session;
}

async function publishSession(tx: Transaction, id: string) {
  const revision = await bumpCatStreamRevision(tx, id);
  await publishLive(tx, `cat-stream/${id}`, revision);
  return revision;
}

export async function getCatStreamSession(db: Database, identity: Identity) {
  if (!identity.tokenIdentifier) return null;
  return withTransaction(db, async (tx) => {
    const user = await getUserByTokenIdentifier(
      tx,
      identity.tokenIdentifier as string,
    );
    if (!user) return null;
    const session = await selectCatStreamSessionByUser(tx, user.id);
    return session ? record(session) : null;
  });
}

export async function getCatStreamSessionByApiKey(
  db: Database,
  apiKey: string,
) {
  const user = await findUserByApiKey(db, apiKey);
  if (!user) return null;
  const session = await selectCatStreamSessionByUser(db, user.id);
  return session ? record(session) : null;
}

export async function getCatStreamSnapshot(db: Database, id: string) {
  const row = await selectCatStreamSession(db, id);
  return row ? { revision: row.revision ?? 0, data: record(row) } : null;
}

export async function ensureCatStreamSession(
  db: Database,
  identity: Identity,
  settings?: unknown,
) {
  return withTransaction(db, async (tx) => {
    const current = await hostSession(tx, identity).catch((error) => {
      if (error instanceof ServiceError && error.code === "not_found")
        return null;
      throw error;
    });
    if (current) {
      if (settings !== undefined) {
        const updated = await updateCatStreamSession(tx, current.id, {
          settings: settingsValue(settings),
        });
        await publishSession(tx, current.id);
        return updated?.id ?? current.id;
      }
      return current.id;
    }
    const user = await getUserByTokenIdentifier(
      tx,
      identity.tokenIdentifier as string,
    );
    if (!user) throw new ServiceError("not_found", "User not found");
    const created = await insertCatStreamSession(tx, {
      userId: user.id,
      status: "idle",
      settings: settingsValue(settings ?? {}),
      testMode: false,
      revision: 1,
    });
    if (!created) {
      const raced = await selectCatStreamSessionByUser(tx, user.id);
      if (raced) return raced.id;
      throw new ServiceError("unavailable", "Failed to create stream session");
    }
    await publishLive(tx, `cat-stream/${created.id}`, 1);
    return created.id;
  });
}

async function mutateHost(
  db: Database,
  identity: Identity,
  mutator: (
    tx: Transaction,
    session: CatSession,
  ) => Promise<Partial<typeof catStreamSessions.$inferInsert> | null>,
  result: (row: CatSession) => unknown = () => undefined,
) {
  return withTransaction(db, async (tx) => {
    const session = await hostSession(tx, identity);
    const patch = await mutator(tx, session);
    if (patch === null) return undefined;
    const updated = await updateCatStreamSession(tx, session.id, patch);
    if (!updated) return undefined;
    await publishSession(tx, session.id);
    return result(updated);
  });
}

export const updateCatStreamSettings = (
  db: Database,
  identity: Identity,
  settings: unknown,
) =>
  mutateHost(db, identity, async () => ({ settings: settingsValue(settings) }));
export const mergeCatStreamSettings = (
  db: Database,
  identity: Identity,
  partial: Record<string, unknown>,
) =>
  mutateHost(db, identity, async (_tx, session) => ({
    settings: settingsValue({
      ...(session.settings as Record<string, unknown>),
      ...partial,
    }),
  }));

function nextSeq(session: CatSession) {
  return ((session.currentCommand as { seq?: number } | null)?.seq ?? 0) + 1;
}

export async function triggerCatStreamSpin(
  db: Database,
  identity: Identity,
  args: { params: unknown; slots?: unknown; countdownSeconds?: number },
) {
  return mutateHost(
    db,
    identity,
    async (_tx, session) => ({
      status: "active",
      currentCommand: commandValue({
        type: "spin",
        seq: nextSeq(session),
        params: args.params,
        ...(args.slots !== undefined ? { slots: args.slots } : {}),
        ...(args.countdownSeconds !== undefined
          ? { countdownSeconds: args.countdownSeconds }
          : {}),
        timestamp: Date.now(),
      }),
    }),
    (row) => (row.currentCommand as { seq: number }).seq,
  );
}

export async function attachCatStreamViewSlug(
  db: Database,
  identity: Identity,
  args: { seq: number; slug: string },
) {
  return mutateHost(db, identity, async (_tx, session) => {
    const command = session.currentCommand as {
      type?: string;
      seq?: number;
      viewSlug?: string;
      params?: unknown;
    } | null;
    const isSpin = command?.type === "spin" && command.seq === args.seq;
    const isWheel =
      command?.type === "wheel" &&
      command.seq === args.seq + 1 &&
      session.lastWheelSpinForSeq === args.seq;
    if (!command || (!isSpin && !isWheel)) return null;
    return {
      currentCommand: commandValue({ ...command, viewSlug: args.slug }),
    };
  });
}

export async function triggerCatStreamWheel(db: Database, identity: Identity) {
  return withTransaction(db, async (tx) => {
    const session = await hostSession(tx, identity);
    const source = session.currentCommand as Parameters<
      typeof buildStreamWheelUpdate
    >[0]["currentCommand"];
    const spin = pickStreamWheelSpin();
    const now = Date.now();
    const update = buildStreamWheelUpdate(
      {
        currentCommand: source,
        lastWheelSpinForSeq: session.lastWheelSpinForSeq ?? undefined,
      },
      spin,
      now,
    );
    await insertWheelSpin(tx, {
      ...update.wheelLog,
      actorKey: identity.tokenIdentifier,
      createdAt: new Date(now),
    });
    const updated = await updateCatStreamSession(tx, session.id, {
      status: update.patch.status,
      currentCommand: commandValue(update.patch.currentCommand),
      lastWheelSpinForSeq: update.patch.lastWheelSpinForSeq,
    });
    await publishSession(tx, session.id);
    return updated ? spin : null;
  });
}

export async function triggerCatStreamEvolution(
  db: Database,
  identity: Identity,
  evolution: unknown,
) {
  return mutateHost(
    db,
    identity,
    async (_tx, session) => {
      const seq = nextSeq(session);
      return {
        status: "active",
        currentCommand: commandValue({
          type: "evolution",
          seq,
          evolution,
          timestamp: Date.now(),
        }),
        evolutionState: { seq, offsetMs: 0 },
      };
    },
    (row) => (row.currentCommand as { seq: number }).seq,
  );
}

export async function triggerCatStreamBatch(
  db: Database,
  identity: Identity,
  batch: unknown,
) {
  return mutateHost(
    db,
    identity,
    async (_tx, session) => {
      const seq = nextSeq(session);
      return {
        status: "active",
        currentCommand: commandValue({
          type: "batch",
          seq,
          batch,
          timestamp: Date.now(),
        }),
        batchState: {
          seq,
          stageIndex: 0,
          awaitingCull: false,
          eliminatedIds: [],
        },
      };
    },
    (row) => (row.currentCommand as { seq: number }).seq,
  );
}

export async function reportBatchStage(
  db: Database,
  apiKey: string,
  args: { seq: number; stageIndex: number; awaitingCull: boolean },
) {
  return withTransaction(db, (tx) =>
    reportBatchStageInTransaction(tx, apiKey, args),
  );
}

type BatchStageArgs = {
  seq: number;
  stageIndex: number;
  awaitingCull: boolean;
};

function validateApiKey(
  user: Awaited<ReturnType<typeof getUserByApiKey>>,
  apiKey: string,
) {
  const valid = user?.apiKey ? Buffer.from(user.apiKey) : Buffer.alloc(0);
  const provided = Buffer.from(apiKey);
  if (
    !user ||
    valid.length !== provided.length ||
    !timingSafeEqual(valid, provided)
  )
    throw new ServiceError("forbidden", "Unknown API key");
}

function previousBatchState(session: CatSession, args: BatchStageArgs) {
  return session.batchState?.seq === args.seq
    ? session.batchState
    : {
        seq: args.seq,
        stageIndex: 0,
        awaitingCull: false,
        eliminatedIds: [],
      };
}

function validBatchStage(
  args: BatchStageArgs,
  previous: NonNullable<CatSession["batchState"]>,
  lastStage: number,
) {
  if (
    !Number.isInteger(args.stageIndex) ||
    args.stageIndex < 0 ||
    args.stageIndex > lastStage ||
    args.stageIndex > previous.stageIndex + 1
  )
    return false;
  if (args.stageIndex < previous.stageIndex) return false;
  if (args.stageIndex !== previous.stageIndex) return true;
  if (args.awaitingCull && previous.eliminatedIds.length > args.stageIndex)
    return false;
  return args.awaitingCull || !previous.awaitingCull;
}

async function reportBatchStageInTransaction(
  tx: Transaction,
  apiKey: string,
  args: BatchStageArgs,
) {
  const user = await getUserByApiKey(tx, apiKey);
  validateApiKey(user, apiKey);
  const session = await selectCatStreamSessionByUser(tx, user.id);
  if (!session) throw new ServiceError("not_found", "No stream session found");
  const command = session.currentCommand as {
    type?: string;
    seq?: number;
    batch?: { cats: { id: string }[]; finalCount: number };
  } | null;
  if (command?.type !== "batch" || command.seq !== args.seq) return undefined;
  const previous = previousBatchState(session, args);
  const lastStage = command.batch
    ? Math.max(0, command.batch.cats.length - command.batch.finalCount)
    : Number.POSITIVE_INFINITY;
  if (!validBatchStage(args, previous, lastStage)) return undefined;
  await updateCatStreamSession(tx, session.id, {
    batchState: {
      ...previous,
      stageIndex: args.stageIndex,
      awaitingCull: args.awaitingCull,
      ...(previous.stageStartedAt === undefined ||
      args.stageIndex > previous.stageIndex
        ? { stageStartedAt: Date.now() }
        : {}),
    },
  });
  await publishSession(tx, session.id);
  return undefined;
}

export async function markBatchCat(
  db: Database,
  identity: Identity,
  args: { seq: number; catId: string | null },
) {
  return mutateHost(db, identity, async (_tx, session) => {
    const state = session.batchState;
    const command = session.currentCommand as {
      type?: string;
      seq?: number;
    } | null;
    if (
      command?.type !== "batch" ||
      command?.seq !== args.seq ||
      state?.seq !== args.seq
    )
      return null;
    const { markedId: _removed, ...rest } = state;
    return {
      batchState: args.catId ? { ...rest, markedId: args.catId } : rest,
    };
  });
}

export async function setBatchHighlight(
  db: Database,
  identity: Identity,
  args: {
    seq: number;
    catId: string;
    kind: "potential" | "favorite" | "spotlight";
  },
) {
  return mutateHost(db, identity, async (_tx, session) => {
    const state = session.batchState;
    const command = session.currentCommand as {
      type?: string;
      seq?: number;
    } | null;
    if (
      command?.type !== "batch" ||
      command?.seq !== args.seq ||
      state?.seq !== args.seq
    )
      return null;
    if (args.kind === "spotlight") {
      const { spotlightId: previous, ...rest } = state;
      return {
        batchState:
          previous === args.catId ? rest : { ...rest, spotlightId: args.catId },
      };
    }
    const key = args.kind === "potential" ? "potentialIds" : "favoriteIds";
    const current = state[key] ?? [];
    return {
      batchState: {
        ...state,
        [key]: current.includes(args.catId)
          ? current.filter((id) => id !== args.catId)
          : [...current, args.catId],
      },
    };
  });
}

function applyBatchCull(
  state: NonNullable<CatSession["batchState"]>,
  catId: string,
  now: number,
) {
  const {
    markedId: _marked,
    spotlightId: _spotlight,
    pendingCullId: _pending,
    verdictAt: _verdict,
    potentialIds,
    ...rest
  } = state;
  const nextPotential = (potentialIds ?? []).filter((id) => id !== catId);
  return {
    ...rest,
    awaitingCull: false,
    eliminatedIds: [...state.eliminatedIds, catId],
    lastCullAt: now,
    ...(nextPotential.length ? { potentialIds: nextPotential } : {}),
  };
}
function withoutArmedCull(state: NonNullable<CatSession["batchState"]>) {
  const { pendingCullId: _pending, verdictAt: _verdict, ...rest } = state;
  return rest;
}

export async function cullBatchCat(
  db: Database,
  identity: Identity,
  args: { seq: number; catId: string },
) {
  return withTransaction(db, (tx) =>
    cullBatchCatInTransaction(tx, identity, args),
  );
}

type BatchCommand = {
  type?: string;
  seq?: number;
  batch?: { cats: { id: string }[]; finalCount: number };
};

function validateCullRequest(
  command: BatchCommand | null,
  state: CatSession["batchState"],
  args: { seq: number; catId: string },
) {
  if (command?.type !== "batch" || command.seq !== args.seq)
    throw new ServiceError("conflict", "No matching batch is running.");
  if (!command.batch || state?.seq !== args.seq)
    throw new ServiceError("conflict", "Batch state is out of sync.");
  if (!state.awaitingCull)
    throw new ServiceError(
      "conflict",
      "The overlay is not waiting for a cull right now.",
    );
  if (state.eliminatedIds.includes(args.catId))
    throw new ServiceError("conflict", "That cat was already removed.");
  if (!command.batch.cats.some((cat) => cat.id === args.catId))
    throw new ServiceError("invalid_input", "Unknown cat.");
  if (
    state.eliminatedIds.length >=
    command.batch.cats.length - command.batch.finalCount
  )
    throw new ServiceError("conflict", "All eliminations are done.");
  return state;
}

async function resolveArmedCull(
  tx: Transaction,
  session: CatSession,
  state: NonNullable<CatSession["batchState"]>,
  args: { seq: number; catId: string },
  now: number,
) {
  if (!state.pendingCullId || state.verdictAt === undefined)
    return { handled: false as const, state };
  if (now < state.verdictAt + VERDICT_GRACE_MS)
    throw new ServiceError("conflict", "A verdict is already running.");
  if (state.pendingCullId !== args.catId)
    return { handled: false as const, state: withoutArmedCull(state) };
  const updated = await updateCatStreamSession(tx, session.id, {
    batchState: applyBatchCull(state, args.catId, now),
  });
  await publishSession(tx, session.id);
  return {
    handled: true as const,
    result: updated ? { verdictAt: now } : undefined,
  };
}

async function cullBatchCatInTransaction(
  tx: Transaction,
  identity: Identity,
  args: { seq: number; catId: string },
) {
  const session = await hostSession(tx, identity);
  const command = session.currentCommand as BatchCommand | null;
  const state = validateCullRequest(command, session.batchState, args);
  const now = Date.now();
  const armed = await resolveArmedCull(tx, session, state, args, now);
  if (armed.handled) return armed.result;
  const verdictAt = now + VERDICT_MS;
  await updateCatStreamSession(tx, session.id, {
    batchState: {
      ...armed.state,
      markedId: args.catId,
      pendingCullId: args.catId,
      verdictAt,
    },
  });
  await publishSession(tx, session.id);
  await enqueueJob(tx, {
    kind: "cat-stream.finalize-batch-cull",
    dedupeKey: `batch-cull:${session.id}:${args.seq}:${verdictAt}`,
    payload: {
      sessionId: session.id,
      seq: args.seq,
      catId: args.catId,
      verdictAt,
    },
    runAfter: new Date(verdictAt),
  });
  return { verdictAt };
}

export async function cancelBatchCull(
  db: Database,
  identity: Identity,
  args: { seq: number },
) {
  return mutateHost(db, identity, async (_tx, session) => {
    const command = session.currentCommand as {
      type?: string;
      seq?: number;
    } | null;
    const state = session.batchState;
    if (
      command?.type !== "batch" ||
      command?.seq !== args.seq ||
      state?.seq !== args.seq ||
      !state.pendingCullId ||
      state.verdictAt === undefined
    )
      return null;
    const now = Date.now();
    if (now >= state.verdictAt && now <= state.verdictAt + VERDICT_GRACE_MS)
      throw new ServiceError("conflict", "Too late to cancel.");
    return { batchState: withoutArmedCull(state) };
  });
}

export async function finalizeBatchCull(
  db: Database,
  args: { sessionId: string; seq: number; catId: string; verdictAt: number },
) {
  return withTransaction(db, async (tx) => {
    const session = await selectCatStreamSessionForUpdate(tx, args.sessionId);
    const command = session?.currentCommand as {
      type?: string;
      seq?: number;
    } | null;
    const state = session?.batchState;
    if (
      !session ||
      command?.type !== "batch" ||
      command?.seq !== args.seq ||
      state?.seq !== args.seq ||
      state.pendingCullId !== args.catId ||
      state.verdictAt !== args.verdictAt
    )
      return { applied: 0 };
    await updateCatStreamSession(tx, session.id, {
      batchState: applyBatchCull(state, args.catId, Date.now()),
    });
    await publishSession(tx, session.id);
    return { applied: 1 };
  });
}

function evolutionClock(session: CatSession, seq: number) {
  const command = session.currentCommand as {
    type?: string;
    seq?: number;
    timestamp?: number;
  } | null;
  if (command?.type !== "evolution" || command.seq !== seq) return null;
  return {
    timestamp: command.timestamp ?? 0,
    state:
      session.evolutionState?.seq === seq
        ? session.evolutionState
        : { seq, offsetMs: 0 },
  };
}
function releasedEvolution(
  state: NonNullable<CatSession["evolutionState"]>,
  now: number,
) {
  if (state.holdStartedAt === undefined) return state;
  const { holdStartedAt, ...rest } = state;
  return {
    ...rest,
    offsetMs:
      state.offsetMs + Math.min(Math.max(0, now - holdStartedAt), HOLD_MAX_MS),
  };
}

export async function holdEvolution(
  db: Database,
  identity: Identity,
  args: { seq: number; parkAtElapsedMs?: number },
) {
  return withTransaction(db, async (tx) => {
    const session = await hostSession(tx, identity);
    const clock = evolutionClock(session, args.seq);
    if (!clock || clock.state.holdStartedAt !== undefined) return undefined;
    const now = Date.now();
    const offsetMs =
      args.parkAtElapsedMs === undefined
        ? clock.state.offsetMs
        : now - clock.timestamp - Math.max(0, args.parkAtElapsedMs);
    await updateCatStreamSession(tx, session.id, {
      evolutionState: { ...clock.state, offsetMs, holdStartedAt: now },
    });
    await publishSession(tx, session.id);
    await enqueueJob(tx, {
      kind: "cat-stream.auto-release-evolution",
      dedupeKey: `evolution-hold:${session.id}:${args.seq}:${now}`,
      payload: { sessionId: session.id, seq: args.seq, holdStartedAt: now },
      runAfter: new Date(now + HOLD_MAX_MS),
    });
    return undefined;
  });
}
export async function releaseEvolution(
  db: Database,
  identity: Identity,
  args: { seq: number },
) {
  return mutateHost(db, identity, async (_tx, session) => {
    const clock = evolutionClock(session, args.seq);
    if (clock?.state.holdStartedAt === undefined) return null;
    return { evolutionState: releasedEvolution(clock.state, Date.now()) };
  });
}
export async function autoReleaseEvolution(
  db: Database,
  args: { sessionId: string; seq: number; holdStartedAt: number },
) {
  return withTransaction(db, async (tx) => {
    const session = await selectCatStreamSessionForUpdate(tx, args.sessionId);
    const state = session?.evolutionState;
    if (
      !session ||
      state?.seq !== args.seq ||
      state.holdStartedAt !== args.holdStartedAt
    )
      return { applied: 0 };
    await updateCatStreamSession(tx, session.id, {
      evolutionState: releasedEvolution(state, Date.now()),
    });
    await publishSession(tx, session.id);
    return { applied: 1 };
  });
}
export async function revealEvolutionAt(
  db: Database,
  identity: Identity,
  args: { seq: number; targetElapsedMs: number },
) {
  return mutateHost(db, identity, async (_tx, session) => {
    const clock = evolutionClock(session, args.seq);
    return clock
      ? {
          evolutionState: {
            seq: args.seq,
            offsetMs:
              Date.now() - clock.timestamp - Math.max(0, args.targetElapsedMs),
            ...(clock.state.skipToBoard ? { skipToBoard: true } : {}),
          },
        }
      : null;
  });
}
export async function skipEvolutionToBoard(
  db: Database,
  identity: Identity,
  args: { seq: number },
) {
  return mutateHost(db, identity, async (_tx, session) => {
    const clock = evolutionClock(session, args.seq);
    return clock
      ? {
          evolutionState: {
            ...releasedEvolution(clock.state, Date.now()),
            skipToBoard: true,
          },
        }
      : null;
  });
}

export async function attachBatchSlug(
  db: Database,
  identity: Identity,
  args: { seq: number; slug: string },
) {
  return mutateHost(db, identity, async (_tx, session) => {
    const command = session.currentCommand as {
      type?: string;
      seq?: number;
      batch?: Record<string, unknown>;
    } | null;
    return command?.type === "batch" &&
      command.seq === args.seq &&
      command.batch
      ? {
          currentCommand: commandValue({
            ...command,
            batch: { ...command.batch, slug: args.slug },
          }),
        }
      : null;
  });
}
export async function showLobby(db: Database, identity: Identity) {
  return mutateHost(db, identity, async (_tx, session) => ({
    status: "active",
    currentCommand: commandValue({
      type: "lobby",
      seq: nextSeq(session),
      timestamp: Date.now(),
    }),
  }));
}
export async function showBrb(db: Database, identity: Identity) {
  return mutateHost(db, identity, async (_tx, session) => ({
    status: "active",
    currentCommand: commandValue({
      type: "brb",
      seq: nextSeq(session),
      timestamp: Date.now(),
    }),
  }));
}
export async function clearOverlay(db: Database, identity: Identity) {
  return mutateHost(db, identity, async (_tx, session) => ({
    status: "idle",
    currentCommand: commandValue({
      type: "clear",
      seq: nextSeq(session),
      timestamp: Date.now(),
    }),
  }));
}
export async function toggleTestMode(db: Database, identity: Identity) {
  return mutateHost(db, identity, async (_tx, session) => ({
    testMode: !session.testMode,
  }));
}
