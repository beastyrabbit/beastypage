import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { ANONYMOUS } from "../auth/identity";
import { closeDatabase, getDb } from "../db/client";
import type { Database } from "../db/pool";
import { createLiveListenerForTests, stopLiveListener } from "../live/listener";
import { streamTopic } from "../live/topics/stream";
import { autoReleaseEvolution, finalizeBatchCull } from "./catStream";
import {
  createStreamParticipant,
  createStreamSession,
  createStreamVote,
  listStreamVotes,
  updateStreamSession,
} from "./stream";
import { getOrCreateUser } from "./users";

let db: Database;
const host = { tokenIdentifier: "https://stream.test|host" };

beforeAll(async () => {
  process.env.DATABASE_URL = inject("databaseUrl");
  db = getDb();
  await getOrCreateUser(db, host);
});
afterAll(async () => {
  await stopLiveListener();
  await closeDatabase();
});

describe("stream PostgreSQL services", () => {
  it("creates a session and enforces host and viewer credentials", async () => {
    const session = await createStreamSession(
      db,
      {
        viewerKey: `viewer-${crypto.randomUUID()}`,
        status: "live",
        currentStep: "colour",
        allowedOptions: ["classic"],
        params: { _signupsOpen: true, _votesOpen: true },
      },
      host,
    );
    if (!session) throw new Error("session was not created");
    expect(session?.vote_round).toBe(0);
    await expect(
      createStreamSession(
        db,
        { viewerKey: session?.viewer_key ?? "", status: "live" },
        host,
      ),
    ).rejects.toMatchObject({ code: "conflict" });
    const participant = await createStreamParticipant(db, {
      sessionId: session.id,
      viewerSession: "x".repeat(32),
      displayName: "Viewer",
      status: "active",
      fingerprint: "fingerprint",
    });
    expect(participant?.display_name).toBe("Viewer");
    await expect(
      createStreamParticipant(db, {
        sessionId: session.id,
        viewerSession: "y".repeat(32),
        displayName: "Other",
        status: "active",
        fingerprint: "fingerprint",
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("allows one participant vote under concurrent races", async () => {
    const session = await createStreamSession(
      db,
      {
        viewerKey: `viewer-${crypto.randomUUID()}`,
        status: "live",
        currentStep: "colour",
        allowedOptions: ["classic", "mood"],
        params: { _signupsOpen: true, _votesOpen: true },
      },
      host,
    );
    if (!session) throw new Error("session was not created");
    const participant = await createStreamParticipant(db, {
      sessionId: session.id,
      viewerSession: "z".repeat(32),
      displayName: "Racer",
      status: "active",
    });
    const results = await Promise.allSettled(
      ["classic", "mood"].map((optionKey) =>
        createStreamVote(
          db,
          {
            sessionId: session.id,
            stepId: "colour",
            optionKey,
            voteRound: 0,
            votedBy: participant.id,
            viewerSession: "z".repeat(32),
          },
          { tokenIdentifier: null },
        ),
      ),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      await listStreamVotes(db, { session: session.id, limit: 500 }),
    ).toHaveLength(1);
  });

  it("publishes control writes to the authorized stream subscriber", async () => {
    const session = await createStreamSession(
      db,
      {
        viewerKey: `viewer-${crypto.randomUUID()}`,
        status: "live",
        currentStep: "colour",
        allowedOptions: ["classic"],
      },
      host,
    );
    if (!session) throw new Error("session was not created");
    const listener = createLiveListenerForTests();
    const revisions: number[] = [];
    const unsubscribe = listener.subscribe(`stream/${session.id}`, (event) => {
      revisions.push(event.revision);
    });
    await listener.waitUntilReady();
    const request = new NextRequest(
      `http://localhost/api/live/stream/${session.id}?viewerKey=${encodeURIComponent(session.viewer_key)}`,
    );
    const context = { request, identity: ANONYMOUS, db };
    expect(
      await streamTopic.authorize({ id: session.id }, context),
    ).toMatchObject({
      id: session.id,
    });
    const wrongRequest = new NextRequest(
      `http://localhost/api/live/stream/${session.id}?viewerKey=wrong`,
    );
    expect(
      await streamTopic.authorize(
        { id: session.id },
        {
          ...context,
          request: wrongRequest,
        },
      ),
    ).toBeNull();
    await updateStreamSession(
      db,
      { id: session.id, currentStep: "coat" },
      host,
    );
    const deadline = Date.now() + 2_000;
    while (!revisions.some((revision) => revision > 1) && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 10));
    expect(revisions.some((revision) => revision > 1)).toBe(true);
    unsubscribe();
    await listener.stop();
  });

  it("treats stale delayed cull and evolution jobs as no-ops", async () => {
    const session = await createStreamSession(
      db,
      {
        viewerKey: `viewer-${crypto.randomUUID()}`,
        status: "live",
        currentStep: "colour",
        allowedOptions: ["classic"],
        params: { _signupsOpen: true, _votesOpen: true },
      },
      host,
    );
    if (!session) throw new Error("session was not created");
    // The job handlers are guarded by sequence/timestamp and therefore safely
    // ignore payloads from a previous command.
    expect(
      await finalizeBatchCull(db, {
        sessionId: session.id,
        seq: 99,
        catId: "missing",
        verdictAt: 1,
      }),
    ).toEqual({ applied: 0 });
    expect(
      await autoReleaseEvolution(db, {
        sessionId: session.id,
        seq: 99,
        holdStartedAt: 1,
      }),
    ).toEqual({ applied: 0 });
  });
});
