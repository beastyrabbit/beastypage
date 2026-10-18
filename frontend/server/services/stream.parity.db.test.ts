/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { ANONYMOUS } from "../auth/identity";
import { closeDatabase, getDb } from "../db/client";
import type { Database } from "../db/pool";
import { streamParticipants, streamVotes } from "../db/schema";
import {
  createStreamParticipant,
  createStreamSession,
  createStreamVote,
  getStreamSession,
  getStreamSessionByLink,
  listStreamParticipants,
  listStreamSessions,
  listStreamVotes,
  updateStreamParticipant,
  updateStreamSession,
} from "./stream";

const modules = import.meta.glob("../../convex/**/*.ts");
let db: Database;

beforeAll(() => {
  process.env.DATABASE_URL = inject("databaseUrl");
  db = getDb();
});
afterAll(() => closeDatabase());

function identity(name: string) {
  return { tokenIdentifier: `https://stream.parity.test|${name}` };
}

function present<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined)
    throw new Error(`${label} missing`);
  return value;
}

function sessionShape(value: Record<string, unknown> | null) {
  if (!value) return null;
  return {
    viewerKey: value.viewer_key,
    status: value.status,
    currentStep: value.current_step,
    stepIndex: value.step_index,
    stepHistory: value.step_history,
    params: value.params,
    voteRound: value.vote_round,
    allowRepeatIps: value.allow_repeat_ips,
  };
}

function participantShape(value: Record<string, unknown>) {
  return {
    displayName: value.display_name,
    status: value.status,
  };
}

function voteShape(value: Record<string, unknown>) {
  const optionMeta = value.option_meta as Record<string, unknown> | null;
  return {
    stepId: value.step_id,
    optionKey: value.option_key,
    optionMeta: optionMeta
      ? {
          streamer: optionMeta.streamer,
          participantName: optionMeta.participantName,
          label: optionMeta.label,
          step: optionMeta.step,
          via: optionMeta.via,
        }
      : null,
  };
}

describe("stream Convex/PostgreSQL parity", () => {
  it("matches session creation, lookup, updates, rounds, limits and authorization", async () => {
    const owner = identity(`owner-${crypto.randomUUID()}`);
    const other = identity(`other-${crypto.randomUUID()}`);
    const convex = convexTest(schema, modules);
    const convexOwner = convex.withIdentity(owner);
    const convexOther = convex.withIdentity(other);
    const args = {
      viewerKey: `parity-viewer-${crypto.randomUUID()}`,
      status: "live" as const,
      currentStep: "colour",
      allowedOptions: ["classic", "mood"],
      params: { _signupsOpen: true, _votesOpen: true },
      stepHistory: [{ id: "colour" }],
      allowRepeatIps: false,
    };
    const convexCreated = present(
      await convexOwner.mutation(api.streamSessionsV2.create, args),
      "Convex session",
    );
    const postgresCreated = present(
      await createStreamSession(db, args, owner),
      "PostgreSQL session",
    );
    expect(sessionShape(convexCreated as Record<string, unknown>)).toEqual(
      sessionShape(postgresCreated as Record<string, unknown>),
    );

    expect(
      sessionShape(
        (await convex.query(api.streamSessionsV2.get, {
          id: convexCreated.id as never,
        })) as Record<string, unknown> | null,
      ),
    ).toEqual(sessionShape(await getStreamSession(db, postgresCreated.id)));
    expect(
      sessionShape(
        (await convexOwner.query(api.streamSessionsV2.getForHost, {
          id: convexCreated.id,
        })) as Record<string, unknown> | null,
      ),
    ).toEqual(
      sessionShape(await getStreamSessionByLink(db, postgresCreated.id, owner)),
    );
    expect(
      await convexOther.query(api.streamSessionsV2.getForHost, {
        id: convexCreated.id,
      }),
    ).toBeNull();
    expect(
      await getStreamSessionByLink(db, postgresCreated.id, other),
    ).toBeNull();
    expect(
      (await convexOwner.query(api.streamSessionsV2.list, { limit: 1 })).map(
        (row) => sessionShape(row as Record<string, unknown>),
      ),
    ).toEqual(
      (await listStreamSessions(db, { limit: 1 }, owner)).map((row) =>
        sessionShape(row as Record<string, unknown>),
      ),
    );
    expect(
      (
        await convex.query(api.streamSessionsV2.list, {
          viewerKey: args.viewerKey,
          limit: 1,
        })
      ).map((row) => sessionShape(row as Record<string, unknown>)),
    ).toEqual(
      (
        await listStreamSessions(
          db,
          { viewerKey: args.viewerKey, limit: 1 },
          ANONYMOUS,
        )
      ).map((row) => sessionShape(row as Record<string, unknown>)),
    );

    const updateArgs = {
      id: convexCreated.id as never,
      currentStep: "coat",
      allowedOptions: ["black"],
      params: { _signupsOpen: true, _votesOpen: true, _tieIteration: 1 },
    };
    const convexUpdated = await convexOwner.mutation(
      api.streamSessionsV2.update,
      updateArgs,
    );
    const postgresUpdated = await updateStreamSession(
      db,
      {
        id: postgresCreated.id,
        currentStep: updateArgs.currentStep,
        allowedOptions: updateArgs.allowedOptions,
        params: updateArgs.params,
      },
      owner,
    );
    expect(sessionShape(convexUpdated as Record<string, unknown>)).toEqual(
      sessionShape(postgresUpdated as Record<string, unknown>),
    );
    expect((convexUpdated as Record<string, unknown>).vote_round).toBe(1);
    expect((postgresUpdated as Record<string, unknown>).vote_round).toBe(1);

    await expect(
      convexOther.mutation(api.streamSessionsV2.update, updateArgs),
    ).rejects.toThrow("Only the session host may do this");
    await expect(
      updateStreamSession(
        db,
        {
          id: postgresCreated.id,
          currentStep: updateArgs.currentStep,
          allowedOptions: updateArgs.allowedOptions,
          params: updateArgs.params,
        },
        other,
      ),
    ).rejects.toMatchObject({
      code: "forbidden",
      message: "Only the session host may do this",
    });
    await expect(
      convexTest(schema, modules).mutation(api.streamSessionsV2.create, {
        ...args,
        viewerKey: `anon-${crypto.randomUUID()}`,
      }),
    ).rejects.toThrow("Sign in to host a session");
    await expect(
      createStreamSession(
        db,
        { ...args, viewerKey: `anon-${crypto.randomUUID()}` },
        ANONYMOUS,
      ),
    ).rejects.toMatchObject({ code: "forbidden" });

    const tooMany = Array.from({ length: 2_001 }, (_, index) => `x-${index}`);
    await expect(
      convexOwner.mutation(api.streamSessionsV2.update, {
        id: convexCreated.id as never,
        allowedOptions: tooMany,
      }),
    ).rejects.toThrow("Too many choices");
    await expect(
      updateStreamSession(
        db,
        { id: postgresCreated.id, allowedOptions: tooMany },
        owner,
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("matches participant creation, viewer filtering, updates, limits and denials", async () => {
    const owner = identity(`participant-owner-${crypto.randomUUID()}`);
    const other = identity(`participant-other-${crypto.randomUUID()}`);
    const convex = convexTest(schema, modules);
    const convexOwner = convex.withIdentity(owner);
    const convexOther = convex.withIdentity(other);
    const sessionArgs = {
      viewerKey: `participant-viewer-${crypto.randomUUID()}`,
      status: "live" as const,
      currentStep: "colour",
      allowedOptions: ["classic"],
      params: { _signupsOpen: true },
    };
    const convexSession = present(
      await convexOwner.mutation(api.streamSessionsV2.create, sessionArgs),
      "Convex participant session",
    );
    const postgresSession = present(
      await createStreamSession(db, sessionArgs, owner),
      "PostgreSQL participant session",
    );
    const participantArgs = {
      sessionId: postgresSession.id,
      viewerSession: "p".repeat(32),
      displayName: "Viewer One",
      status: "active",
      fingerprint: `fingerprint-${crypto.randomUUID()}`,
    };
    const convexParticipant = present(
      await convexOwner.mutation(api.streamParticipantsV2.create, {
        ...participantArgs,
        sessionId: convexSession.id as never,
      }),
      "Convex participant",
    );
    const postgresParticipant = present(
      await createStreamParticipant(db, participantArgs),
      "PostgreSQL participant",
    );
    expect(
      participantShape(convexParticipant as Record<string, unknown>),
    ).toEqual(participantShape(postgresParticipant as Record<string, unknown>));
    expect(
      (
        await convex.query(api.streamParticipantsV2.list, {
          session: convexSession.id as never,
          viewerSession: participantArgs.viewerSession,
          limit: 1,
        })
      ).map((row) => participantShape(row as Record<string, unknown>)),
    ).toEqual(
      (
        await listStreamParticipants(
          db,
          {
            session: postgresSession.id,
            viewerSession: participantArgs.viewerSession,
            limit: 1,
          },
          ANONYMOUS,
        )
      ).map((row) => participantShape(row as Record<string, unknown>)),
    );
    const convexUpdated = await convexOwner.mutation(
      api.streamParticipantsV2.update,
      {
        id: convexParticipant.id as never,
        displayName: "Updated Viewer",
      },
    );
    const postgresUpdated = await updateStreamParticipant(
      db,
      { id: postgresParticipant.id, displayName: "Updated Viewer" },
      owner,
    );
    expect(participantShape(convexUpdated as Record<string, unknown>)).toEqual(
      participantShape(postgresUpdated as Record<string, unknown>),
    );
    await expect(
      convexOther.mutation(api.streamParticipantsV2.update, {
        id: convexParticipant.id as never,
        status: "inactive",
      }),
    ).rejects.toThrow("Only the session host may do this");
    await expect(
      updateStreamParticipant(
        db,
        { id: postgresParticipant.id, status: "inactive" },
        other,
      ),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      convexOwner.mutation(api.streamParticipantsV2.create, {
        ...participantArgs,
        sessionId: convexSession.id as never,
        viewerSession: "q".repeat(32),
      }),
    ).rejects.toThrow("This device has already joined");
    await expect(
      createStreamParticipant(db, {
        ...participantArgs,
        viewerSession: "q".repeat(32),
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      convexOwner.mutation(api.streamParticipantsV2.create, {
        ...participantArgs,
        sessionId: convexSession.id as never,
        viewerSession: "short",
      }),
    ).rejects.toThrow("private participant token");
    await expect(
      createStreamParticipant(db, {
        ...participantArgs,
        viewerSession: "short",
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("applies the Convex index limit before its createdAt sort", async () => {
    const owner = identity(`limited-order-owner-${crypto.randomUUID()}`);
    const prefix = `limited-order-${crypto.randomUUID()}`;
    const convex = convexTest(schema, modules);
    const convexOwner = convex.withIdentity(owner);
    const sessionArgs = {
      viewerKey: `${prefix}-viewer`,
      status: "live" as const,
      currentStep: "colour",
      allowedOptions: ["classic"],
      params: { _signupsOpen: true, _votesOpen: true },
    };
    const convexSession = present(
      await convexOwner.mutation(api.streamSessionsV2.create, sessionArgs),
      "Convex limited-order session",
    );
    const postgresSession = present(
      await createStreamSession(db, sessionArgs, owner),
      "PostgreSQL limited-order session",
    );
    const values = [
      ["first", 300],
      ["second", 100],
      ["third", 200],
    ] as const;
    await convex.run(async (ctx) => {
      for (const [name, createdAt] of values) {
        await ctx.db.insert("stream_participants", {
          sessionId: convexSession.id as never,
          displayName: `${prefix}-${name}`,
          status: "active",
          createdAt,
          updatedAt: createdAt,
        });
        await ctx.db.insert("stream_votes", {
          sessionId: convexSession.id as never,
          voteRound: 0,
          stepId: name === "second" ? "target" : "other",
          optionKey: name,
          createdAt,
          updatedAt: createdAt,
        });
      }
    });
    await db.insert(streamParticipants).values(
      values.map(([name, createdAt], index) => ({
        sessionId: postgresSession.id,
        displayName: `${prefix}-${name}`,
        status: "active",
        createdAt: new Date(createdAt),
        updatedAt: new Date(createdAt),
        legacyCreatedAt: new Date(index + 1),
      })),
    );
    await db.insert(streamVotes).values(
      values.map(([name, createdAt], index) => ({
        sessionId: postgresSession.id,
        voteRound: 0,
        stepId: name === "second" ? "target" : "other",
        optionKey: name,
        createdAt: new Date(createdAt),
        updatedAt: new Date(createdAt),
        legacyCreatedAt: new Date(index + 1),
      })),
    );

    const convexParticipants = await convexOwner.query(
      api.streamParticipantsV2.list,
      { session: convexSession.id as never, limit: 2 },
    );
    const postgresParticipants = await listStreamParticipants(
      db,
      { session: postgresSession.id, limit: 2 },
      owner,
    );
    expect(postgresParticipants.map((row) => row.display_name)).toEqual(
      convexParticipants.map((row) => row.display_name),
    );

    const convexVotes = await convex.query(api.streamVotesV2.list, {
      session: convexSession.id as never,
      limit: 2,
    });
    const postgresVotes = await listStreamVotes(db, {
      session: postgresSession.id,
      limit: 2,
    });
    expect(postgresVotes.map((row) => row.option_key)).toEqual(
      convexVotes.map((row) => row.option_key),
    );

    const convexTargetVotes = await convex.query(api.streamVotesV2.list, {
      session: convexSession.id as never,
      stepId: "target",
      limit: 2,
    });
    const postgresTargetVotes = await listStreamVotes(db, {
      session: postgresSession.id,
      stepId: "target",
      limit: 2,
    });
    expect(postgresTargetVotes.map((row) => row.option_key)).toEqual(
      convexTargetVotes.map((row) => row.option_key),
    );
  });

  it("matches vote rounds, host metadata, viewer keys and one-vote rules", async () => {
    const owner = identity(`vote-owner-${crypto.randomUUID()}`);
    const other = identity(`vote-other-${crypto.randomUUID()}`);
    const convex = convexTest(schema, modules);
    const convexOwner = convex.withIdentity(owner);
    const convexOther = convex.withIdentity(other);
    const sessionArgs = {
      viewerKey: `vote-viewer-${crypto.randomUUID()}`,
      status: "live" as const,
      currentStep: "colour",
      allowedOptions: ["classic", "mood"],
      params: { _signupsOpen: true, _votesOpen: true },
    };
    const convexSession = present(
      await convexOwner.mutation(api.streamSessionsV2.create, sessionArgs),
      "Convex vote session",
    );
    const postgresSession = present(
      await createStreamSession(db, sessionArgs, owner),
      "PostgreSQL vote session",
    );
    const participantArgs = {
      viewerSession: "v".repeat(32),
      displayName: "Voting Viewer",
      status: "active",
    };
    const convexParticipant = present(
      await convexOwner.mutation(api.streamParticipantsV2.create, {
        ...participantArgs,
        sessionId: convexSession.id as never,
      }),
      "Convex vote participant",
    );
    const postgresParticipant = present(
      await createStreamParticipant(db, {
        ...participantArgs,
        sessionId: postgresSession.id,
      }),
      "PostgreSQL vote participant",
    );
    const viewerVote = {
      sessionId: postgresSession.id,
      stepId: "colour",
      optionKey: "classic",
      voteRound: 0,
      votedBy: postgresParticipant.id,
      viewerSession: participantArgs.viewerSession,
    };
    const convexViewerVote = await convexOwner.mutation(
      api.streamVotesV2.create,
      {
        ...viewerVote,
        sessionId: convexSession.id as never,
        votedBy: convexParticipant.id as never,
      },
    );
    const postgresViewerVote = await createStreamVote(
      db,
      viewerVote,
      ANONYMOUS,
    );
    expect(voteShape(convexViewerVote as Record<string, unknown>)).toEqual(
      voteShape(postgresViewerVote as Record<string, unknown>),
    );
    await expect(
      convexOwner.mutation(api.streamVotesV2.create, {
        ...viewerVote,
        sessionId: convexSession.id as never,
        votedBy: convexParticipant.id as never,
      }),
    ).rejects.toThrow("already voted");
    await expect(
      createStreamVote(db, viewerVote, ANONYMOUS),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      convexOwner.mutation(api.streamVotesV2.create, {
        ...viewerVote,
        sessionId: convexSession.id as never,
        votedBy: convexParticipant.id as never,
        viewerSession: "wrong".repeat(8),
      }),
    ).rejects.toThrow("Not an active participant");
    await expect(
      createStreamVote(
        db,
        { ...viewerVote, viewerSession: "wrong".repeat(8) },
        ANONYMOUS,
      ),
    ).rejects.toMatchObject({ code: "forbidden" });

    const hostVote = {
      sessionId: postgresSession.id,
      stepId: "colour",
      optionKey: "mood",
      voteRound: 0,
      optionMeta: {
        label: "Mood",
        step: "Colour",
        via: "coinFlip",
        ignored: "not persisted",
      },
    };
    const convexHostVote = await convexOwner.mutation(
      api.streamVotesV2.create,
      { ...hostVote, sessionId: convexSession.id as never },
    );
    const postgresHostVote = await createStreamVote(db, hostVote, owner);
    expect(voteShape(convexHostVote as Record<string, unknown>)).toEqual(
      voteShape(postgresHostVote as Record<string, unknown>),
    );
    await expect(
      convexOther.mutation(api.streamVotesV2.create, {
        ...hostVote,
        sessionId: convexSession.id as never,
      }),
    ).rejects.toThrow("Only the session host may do this");
    await expect(createStreamVote(db, hostVote, other)).rejects.toMatchObject({
      code: "forbidden",
    });
    expect(
      (
        await convex.query(api.streamVotesV2.list, {
          session: convexSession.id as never,
          limit: 1,
        })
      ).map((row) => voteShape(row as Record<string, unknown>)),
    ).toHaveLength(1);
    expect(
      await listStreamVotes(db, {
        session: postgresSession.id,
        limit: 1,
      }),
    ).toHaveLength(1);
    expect(
      await listStreamVotes(db, {
        session: postgresSession.id,
        stepId: "missing",
        limit: 500,
      }),
    ).toEqual([]);
    await expect(
      convexOwner.mutation(api.streamVotesV2.create, {
        ...hostVote,
        sessionId: convexSession.id as never,
        voteRound: 99,
      }),
    ).rejects.toThrow("no longer active");
    await expect(
      createStreamVote(db, { ...hostVote, voteRound: 99 }, owner),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      createStreamVote(
        db,
        {
          ...hostVote,
          optionKey: "missing",
        },
        owner,
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      convexOwner.mutation(api.streamVotesV2.create, {
        ...hostVote,
        sessionId: convexSession.id as never,
        optionKey: "missing",
      }),
    ).rejects.toThrow("Choice is not available");
  });

  it("keeps the wheel helpers aligned with their Convex source contract", async () => {
    const { buildStreamWheelUpdate, pickStreamWheelSpin } = await import(
      "../../convex/streamWheel"
    );
    const spin = pickStreamWheelSpin(99);
    expect(spin).toMatchObject({
      prizeName: "Singularity",
      prizeIndex: 6,
      randomBucket: 99,
      forced: false,
    });
    expect(
      buildStreamWheelUpdate(
        {
          currentCommand: { type: "spin", seq: 4, params: { colour: "BLACK" } },
        },
        spin,
        123,
      ).patch.currentCommand.seq,
    ).toBe(5);
    expect(() => pickStreamWheelSpin(100)).toThrow(RangeError);
    expect(() => buildStreamWheelUpdate({}, spin, 123)).toThrow(
      "Spin a cat before spinning the wheel.",
    );
  });
});
