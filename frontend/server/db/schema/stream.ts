import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  BatchLiveState,
  CatStreamCommand,
  CatStreamSettings,
  EvolutionLiveState,
  StreamParams,
  StreamStepHistory,
  StreamVoteOptionMeta,
} from "../contracts";
import { createdUpdated, legacyColumns, primaryId, tstz } from "./columns";
import { users } from "./users";

/**
 * Live aggregates carry `revision`; every write bumps it in the same
 * transaction that appends to live_events (ADR §10).
 */
const revision = () =>
  bigint("revision", { mode: "number" }).notNull().default(0);

export const streamSessions = pgTable(
  "stream_sessions",
  {
    id: primaryId(),
    ...legacyColumns(),
    ownerTokenIdentifier: text("owner_token_identifier"),
    allowedOptions: text("allowed_options").array(),
    voteRound: integer("vote_round"),
    viewerKey: text("viewer_key").notNull(),
    status: text("status").notNull(),
    currentStep: text("current_step"),
    stepIndex: integer("step_index"),
    stepHistory: jsonb("step_history").$type<StreamStepHistory>(),
    params: jsonb("params").$type<StreamParams>(),
    allowRepeatIps: boolean("allow_repeat_ips"),
    revision: revision(),
    ...createdUpdated(),
  },
  (t) => [
    uniqueIndex("stream_sessions_viewer_key_key").on(t.viewerKey),
    index("stream_sessions_status_idx").on(t.status),
    index("stream_sessions_owner_updated_idx").on(
      t.ownerTokenIdentifier,
      t.updatedAt,
    ),
    index("stream_sessions_owner_status_updated_idx").on(
      t.ownerTokenIdentifier,
      t.status,
      t.updatedAt,
    ),
  ],
);

export const streamParticipants = pgTable(
  "stream_participants",
  {
    id: primaryId(),
    ...legacyColumns(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => streamSessions.id, { onDelete: "cascade" }),
    viewerSession: text("viewer_session"),
    displayName: text("display_name").notNull(),
    status: text("status").notNull(),
    fingerprint: text("fingerprint"),
    ...createdUpdated(),
  },
  (t) => [
    index("stream_participants_session_idx").on(t.sessionId),
    index("stream_participants_viewer_session_idx").on(t.viewerSession),
    index("stream_participants_session_viewer_idx").on(
      t.sessionId,
      t.viewerSession,
    ),
    index("stream_participants_session_fingerprint_idx").on(
      t.sessionId,
      t.fingerprint,
    ),
  ],
);

export const streamVotes = pgTable(
  "stream_votes",
  {
    id: primaryId(),
    ...legacyColumns(),
    voteRound: integer("vote_round"),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => streamSessions.id, { onDelete: "cascade" }),
    stepId: text("step_id").notNull(),
    optionKey: text("option_key").notNull(),
    optionMeta: jsonb("option_meta").$type<StreamVoteOptionMeta>(),
    // A removed participant keeps their vote in the tally, as in PostgreSQL.
    votedBy: uuid("voted_by").references(() => streamParticipants.id, {
      onDelete: "set null",
    }),
    ...createdUpdated(),
  },
  (t) => [
    index("stream_votes_session_idx").on(t.sessionId),
    index("stream_votes_step_idx").on(t.sessionId, t.stepId),
    index("stream_votes_session_round_idx").on(t.sessionId, t.voteRound),
    index("stream_votes_session_round_voter_idx").on(
      t.sessionId,
      t.voteRound,
      t.votedBy,
    ),
  ],
);

export const wheelSpins = pgTable(
  "wheel_spins",
  {
    id: primaryId(),
    ...legacyColumns(),
    prizeName: text("prize_name").notNull(),
    forced: boolean("forced").notNull(),
    randomBucket: doublePrecision("random_bucket"),
    actorKey: text("actor_key"),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("wheel_spins_prize_idx").on(t.prizeName),
    index("wheel_spins_created_idx").on(t.createdAt),
    index("wheel_spins_actor_created_idx").on(t.actorKey, t.createdAt),
  ],
);

/** One OBS stream session per user (PostgreSQL `byUserId` + `.unique()`). */
export const catStreamSessions = pgTable(
  "cat_stream_sessions",
  {
    id: primaryId(),
    ...legacyColumns(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["active", "idle"] }).notNull(),
    settings: jsonb("settings").$type<CatStreamSettings>().notNull(),
    currentCommand: jsonb("current_command").$type<CatStreamCommand>(),
    testMode: boolean("test_mode").notNull(),
    lastWheelSpinForSeq: integer("last_wheel_spin_for_seq"),
    batchState: jsonb("batch_state").$type<BatchLiveState>(),
    evolutionState: jsonb("evolution_state").$type<EvolutionLiveState>(),
    revision: revision(),
    ...createdUpdated(),
  },
  (t) => [
    uniqueIndex("cat_stream_sessions_user_key").on(t.userId),
    // Overlay payloads stay params-only (no rendered images); keep the
    // ceiling PostgreSQL's 1 MiB document limit used to enforce.
    check(
      "cat_stream_sessions_command_size",
      sql`octet_length(${t.currentCommand}::text) <= 1000000`,
    ),
  ],
);
