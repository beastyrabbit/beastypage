import "server-only";

import type { Identity } from "../auth/identity";
import type { Database } from "../db/pool";
import type { streamParticipants, streamSessions } from "../db/schema";
import { withTransaction } from "../db/transaction";
import { ServiceError } from "../errors";
import { publishLive } from "../live/publish";
import { findStreamSessionByLink } from "../repositories/legacyLinks";
import {
  bumpStreamRevision,
  countParticipants,
  insertParticipant,
  insertStreamSession,
  insertVote,
  selectOwnedStreamSessions,
  selectParticipant,
  selectParticipantByFingerprint,
  selectParticipantByViewerSession,
  selectParticipants,
  selectStreamSession,
  selectStreamSessionByViewerKey,
  selectStreamSessionByViewerKeyForUpdate,
  selectStreamSessionForUpdate,
  selectVoteByParticipant,
  selectVotes,
  updateParticipant,
  updateStreamSession as updateStreamSessionRow,
} from "../repositories/stream";

const MAX_PARTICIPANTS = 500;
const MAX_OPTIONS = 2_000;

function limit(value: number | undefined): number {
  return Number.isFinite(value)
    ? Math.max(1, Math.min(500, Math.floor(value as number)))
    : 50;
}

function millis(value: Date | null | undefined): number {
  return value?.getTime() ?? 0;
}

function sessionRecord(row: typeof streamSessions.$inferSelect) {
  return {
    id: row.id,
    viewer_key: row.viewerKey,
    status: row.status,
    current_step: row.currentStep ?? undefined,
    step_index: row.stepIndex ?? 0,
    step_history: row.stepHistory ?? [],
    params: row.params ?? {},
    vote_round: row.voteRound ?? 0,
    allow_repeat_ips: Boolean(row.allowRepeatIps),
    created: millis(row.createdAt),
    updated: millis(row.updatedAt),
  };
}

function participantRecord(row: typeof streamParticipants.$inferSelect) {
  return {
    id: row.id,
    session: row.sessionId,
    display_name: row.displayName,
    status: row.status,
    created: millis(row.createdAt),
    updated: millis(row.updatedAt),
  };
}

function voteRecord(row: {
  id: string;
  sessionId: string;
  stepId: string;
  optionKey: string;
  optionMeta: unknown;
  votedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    session: row.sessionId,
    step_id: row.stepId,
    option_key: row.optionKey,
    option_meta: row.optionMeta ?? null,
    votedby: row.votedBy ?? null,
    created: millis(row.createdAt),
    updated: millis(row.updatedAt),
  };
}

function hostCheck(
  row: typeof streamSessions.$inferSelect,
  identity: Identity,
) {
  if (
    !identity.tokenIdentifier ||
    row.ownerTokenIdentifier !== identity.tokenIdentifier
  ) {
    throw new ServiceError("forbidden", "Only the session host may do this");
  }
}

async function publishSession(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  id: string,
) {
  const revision = await bumpStreamRevision(tx, id);
  await publishLive(tx, `stream/${id}`, revision);
  return revision;
}

export async function getStreamSession(db: Database, id: string) {
  const row = await findStreamSessionByLink(db, id);
  return row ? sessionRecord(row) : null;
}

export async function getStreamSessionByLink(
  db: Database,
  id: string,
  identity: Identity,
) {
  const row = await findStreamSessionByLink(db, id);
  if (
    !row ||
    !identity.tokenIdentifier ||
    row.ownerTokenIdentifier !== identity.tokenIdentifier
  )
    return null;
  return sessionRecord(row);
}

export async function listStreamSessions(
  db: Database,
  args: {
    status?: string;
    exclude?: string;
    viewerKey?: string;
    limit?: number;
  },
  identity: Identity,
) {
  return withTransaction(db, async (tx) => {
    const indexedStatus =
      args.status ??
      (args.exclude?.toLowerCase() === "completed" ? "live" : undefined);
    let rows = args.viewerKey
      ? (await selectStreamSessionByViewerKey(tx, args.viewerKey))
        ? [
            (await selectStreamSessionByViewerKey(
              tx,
              args.viewerKey,
            )) as NonNullable<
              Awaited<ReturnType<typeof selectStreamSessionByViewerKey>>
            >,
          ]
        : []
      : identity.tokenIdentifier
        ? await selectOwnedStreamSessions(
            tx,
            identity.tokenIdentifier,
            indexedStatus,
          )
        : [];
    if (args.exclude) {
      const target = args.exclude.toLowerCase();
      rows = rows.filter((row) => row.status.toLowerCase() !== target);
    }
    if (args.status) {
      const target = args.status.toLowerCase();
      rows = rows.filter((row) => row.status.toLowerCase() === target);
    }
    return rows.slice(0, limit(args.limit)).map(sessionRecord);
  });
}

export interface CreateStreamArgs {
  allowedOptions?: string[];
  viewerKey: string;
  status: "live" | "completed";
  currentStep?: string;
  stepIndex?: number;
  stepHistory?: unknown;
  params?: Record<string, unknown>;
  allowRepeatIps?: boolean;
}

export interface UpdateStreamArgs {
  id: string;
  allowedOptions?: string[];
  viewerKey?: string;
  status?: "live" | "completed";
  currentStep?: string;
  stepIndex?: number;
  stepHistory?: unknown;
  params?: Record<string, unknown>;
  allowRepeatIps?: boolean;
}

export async function createStreamSession(
  db: Database,
  args: CreateStreamArgs,
  identity: Identity,
) {
  if (!identity.tokenIdentifier)
    throw new ServiceError("forbidden", "Sign in to host a session");
  if (!args.viewerKey)
    throw new ServiceError("invalid_input", "Viewer key is required");
  if ((args.allowedOptions?.length ?? 0) > MAX_OPTIONS)
    throw new ServiceError("invalid_input", "Too many choices");
  return withTransaction(db, async (tx) => {
    if (await selectStreamSessionByViewerKeyForUpdate(tx, args.viewerKey))
      throw new ServiceError("conflict", "Viewer key already in use");
    const row = await insertStreamSession(tx, {
      ownerTokenIdentifier: identity.tokenIdentifier,
      voteRound: 0,
      allowedOptions: args.allowedOptions ?? [],
      viewerKey: args.viewerKey,
      status: args.status,
      stepIndex: args.stepIndex ?? 0,
      stepHistory: (args.stepHistory ?? []) as never,
      params: (args.params ?? {}) as never,
      allowRepeatIps: Boolean(args.allowRepeatIps),
      revision: 1,
      ...(args.currentStep !== undefined
        ? { currentStep: args.currentStep }
        : {}),
    });
    if (!row) throw new ServiceError("conflict", "Viewer key already in use");
    await publishLive(tx, `stream/${row.id}`, 1);
    return sessionRecord(row);
  });
}

export async function updateStreamSession(
  db: Database,
  args: UpdateStreamArgs,
  identity: Identity,
): Promise<ReturnType<typeof sessionRecord> | null> {
  return withTransaction(db, async (tx) => {
    const row = await selectStreamSessionForUpdate(tx, args.id);
    if (!row) return null;
    hostCheck(row, identity);
    if (args.viewerKey !== undefined && args.viewerKey !== row.viewerKey)
      throw new ServiceError("invalid_input", "Viewer key cannot be changed");
    if ((args.allowedOptions?.length ?? 0) > MAX_OPTIONS)
      throw new ServiceError("invalid_input", "Too many choices");
    const roundChanged =
      (args.currentStep !== undefined &&
        args.currentStep !== row.currentStep) ||
      (args.stepIndex !== undefined && args.stepIndex !== row.stepIndex) ||
      (args.params !== undefined &&
        ((args.params as { _tieIteration?: number })._tieIteration ?? 0) >
          (((row.params ?? {}) as { _tieIteration?: number })._tieIteration ??
            0));
    const updated = await updateStreamSessionRow(tx, args.id, {
      voteRound: (row.voteRound ?? 0) + (roundChanged ? 1 : 0),
      allowedOptions:
        args.allowedOptions ?? (roundChanged ? [] : row.allowedOptions),
      status: args.status ?? row.status,
      currentStep: args.currentStep ?? row.currentStep,
      stepIndex: args.stepIndex ?? row.stepIndex,
      stepHistory:
        args.stepHistory === undefined
          ? row.stepHistory
          : (args.stepHistory as never),
      params: args.params === undefined ? row.params : (args.params as never),
      allowRepeatIps:
        args.allowRepeatIps === undefined
          ? row.allowRepeatIps
          : Boolean(args.allowRepeatIps),
    });
    if (!updated) return null;
    await publishSession(tx, args.id);
    return sessionRecord(updated);
  });
}

export async function listStreamParticipants(
  db: Database,
  args: { session: string; viewerSession?: string; limit?: number },
  identity: Identity,
) {
  return withTransaction(db, async (tx) => {
    const session = await selectStreamSession(tx, args.session);
    if (!session) return [];
    if (!args.viewerSession) hostCheck(session, identity);
    const rows = await selectParticipants(
      tx,
      session.id,
      args.viewerSession,
      limit(args.limit),
    );
    return rows.map(participantRecord);
  });
}

export async function createStreamParticipant(
  db: Database,
  args: {
    sessionId: string;
    viewerSession?: string;
    displayName: string;
    status: string;
    fingerprint?: string;
  },
) {
  if (!args.viewerSession || args.viewerSession.length < 32)
    throw new ServiceError(
      "invalid_input",
      "A private participant token is required",
    );
  return withTransaction(db, async (tx) => {
    const session = await selectStreamSessionForUpdate(tx, args.sessionId);
    if (
      !session ||
      session.status === "completed" ||
      (session.params as { _signupsOpen?: boolean } | null)?._signupsOpen ===
        false
    )
      throw new ServiceError("forbidden", "Signups are closed");
    const existing = await selectParticipantByViewerSession(
      tx,
      session.id,
      args.viewerSession as string,
    );
    if (existing) return participantRecord(existing);
    if ((await countParticipants(tx, session.id)) >= MAX_PARTICIPANTS)
      throw new ServiceError(
        "conflict",
        "This session has reached its participant limit",
      );
    if (
      !session.allowRepeatIps &&
      args.fingerprint &&
      (await selectParticipantByFingerprint(tx, session.id, args.fingerprint))
    )
      throw new ServiceError("conflict", "This device has already joined");
    if (
      args.status !== "active" ||
      !args.displayName.trim() ||
      args.displayName.length > 40
    )
      throw new ServiceError("invalid_input", "Invalid participant");
    const row = await insertParticipant(tx, {
      sessionId: session.id,
      viewerSession: args.viewerSession,
      displayName: args.displayName,
      status: args.status,
      fingerprint: args.fingerprint,
    });
    if (!row)
      throw new ServiceError("unavailable", "Failed to register participant");
    await publishSession(tx, session.id);
    return participantRecord(row);
  });
}

export async function updateStreamParticipant(
  db: Database,
  args: {
    id: string;
    displayName?: string;
    status?: string;
    fingerprint?: string;
    viewerSession?: string;
  },
  identity: Identity,
) {
  return withTransaction(db, async (tx) => {
    const participant = await selectParticipant(tx, args.id);
    if (!participant) return null;
    const session = await selectStreamSession(tx, participant.sessionId);
    if (!session) throw new ServiceError("not_found", "Session not found");
    hostCheck(session, identity);
    const row = await updateParticipant(tx, args.id, {
      displayName: args.displayName ?? participant.displayName,
      status: args.status ?? participant.status,
      fingerprint: args.fingerprint ?? participant.fingerprint,
      viewerSession: args.viewerSession ?? participant.viewerSession,
    });
    if (!row) return null;
    await publishSession(tx, session.id);
    return participantRecord(row);
  });
}

function availableChoice(
  session: typeof streamSessions.$inferSelect | null,
  args: { stepId: string; optionKey: string; voteRound?: number },
) {
  if (
    session?.status !== "live" ||
    session?.currentStep !== args.stepId ||
    args.voteRound !== (session?.voteRound ?? 0)
  )
    throw new ServiceError("conflict", "This voting round is no longer active");
  const params = (session.params ?? {}) as {
    _disabledOptions?: Record<string, string[]>;
    _tieFilter?: string[];
  };
  if (
    !session.allowedOptions?.includes(args.optionKey) ||
    params._disabledOptions?.[args.stepId]?.includes(args.optionKey)
  )
    throw new ServiceError("invalid_input", "Choice is not available");
  if (
    Array.isArray(params._tieFilter) &&
    params._tieFilter.length &&
    !params._tieFilter.includes(args.optionKey)
  )
    throw new ServiceError("invalid_input", "Choice is not in the tie-break");
}

export async function listStreamVotes(
  db: Database,
  args: { session: string; stepId?: string; limit?: number },
) {
  return withTransaction(db, async (tx) => {
    const session = await selectStreamSession(tx, args.session);
    if (!session) return [];
    return (
      await selectVotes(
        tx,
        session.id,
        session.voteRound ?? 0,
        args.stepId,
        limit(args.limit),
      )
    ).map(voteRecord);
  });
}

export async function createStreamVote(
  db: Database,
  args: {
    viewerSession?: string;
    voteRound?: number;
    sessionId: string;
    stepId: string;
    optionKey: string;
    optionMeta?: Record<string, unknown>;
    votedBy?: string;
  },
  identity: Identity,
) {
  return withTransaction(
    db,
    async (tx) => {
      const session = await selectStreamSessionForUpdate(tx, args.sessionId);
      availableChoice(session, args);
      let optionMeta: Record<string, unknown>;
      if (args.votedBy) {
        if (
          (session?.params as { _votesOpen?: boolean } | null)?._votesOpen !==
          true
        )
          throw new ServiceError("forbidden", "Voting is closed");
        const participant = await selectParticipant(tx, args.votedBy);
        if (
          !participant ||
          participant.sessionId !== session?.id ||
          participant.status !== "active" ||
          participant.viewerSession !== args.viewerSession
        )
          throw new ServiceError("forbidden", "Not an active participant");
        if (
          await selectVoteByParticipant(
            tx,
            session.id,
            session.voteRound ?? 0,
            participant.id,
          )
        )
          throw new ServiceError(
            "conflict",
            "You have already voted in this round",
          );
        optionMeta = {
          participantId: participant.id,
          participantName: participant.displayName,
        };
      } else {
        if (!session) throw new ServiceError("not_found", "Session not found");
        hostCheck(session, identity);
        optionMeta = { streamer: true };
        for (const key of ["label", "step"] as const)
          if (typeof args.optionMeta?.[key] === "string")
            optionMeta[key] = args.optionMeta[key].slice(0, 160);
        if (args.optionMeta?.via === "coinFlip") optionMeta.via = "coinFlip";
      }
      const row = await insertVote(tx, {
        sessionId: args.sessionId,
        voteRound: session?.voteRound ?? 0,
        stepId: args.stepId,
        optionKey: args.optionKey,
        optionMeta: optionMeta as never,
        votedBy: args.votedBy ?? null,
      });
      if (!row) throw new ServiceError("unavailable", "Failed to record vote");
      await publishSession(tx, args.sessionId);
      return voteRecord(row);
    },
    { isolation: "serializable", retries: 3 },
  );
}

export function streamTopicSnapshot(
  row: Awaited<ReturnType<typeof selectStreamSession>>,
  participants: Awaited<ReturnType<typeof selectParticipants>>,
  votes: Awaited<ReturnType<typeof selectVotes>>,
) {
  if (!row) return null;
  return {
    revision: row.revision ?? 0,
    data: {
      session: sessionRecord(row),
      participants: participants.map(participantRecord),
      votes: votes.map(voteRecord),
    },
  };
}

export async function getStreamSnapshot(
  db: Database,
  id: string,
  options: { viewerSession?: string; stepId?: string } = {},
) {
  return withTransaction(db, async (tx) => {
    const session = await selectStreamSession(tx, id);
    if (!session) return null;
    const participants = await selectParticipants(
      tx,
      id,
      options.viewerSession,
      500,
    );
    const votes = await selectVotes(
      tx,
      id,
      session.voteRound ?? 0,
      options.stepId,
      500,
    );
    return streamTopicSnapshot(session, participants, votes);
  });
}
