import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { closeDatabase } from "@/server/db/client";

const identity: { tokenIdentifier: string | null } = {
  tokenIdentifier: `https://routes.stream|${crypto.randomUUID()}`,
};
const getRequestIdentity = vi.fn(async () => identity);
vi.mock("@/server/auth/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth/identity")>()),
  getRequestIdentity,
}));

const env = { ...process.env };
let sessions: typeof import("./sessions/route");
let participants: typeof import("./participants/route");
let votes: typeof import("./votes/route");

function json(url: string, body: unknown, method = "POST") {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  process.env.DATA_BACKEND = "postgres";
  process.env.DATABASE_URL = inject("databaseUrl");
  [sessions, participants, votes] = await Promise.all([
    import("./sessions/route"),
    import("./participants/route"),
    import("./votes/route"),
  ]);
});
afterAll(async () => {
  await closeDatabase();
  process.env = env;
});

describe("stream PostgreSQL routes", () => {
  it("creates, lists, updates, joins, and votes", async () => {
    const created = await sessions.POST(
      json("http://localhost/api/stream/sessions", {
        operation: "create",
        viewerKey: `route-viewer-${crypto.randomUUID()}`,
        status: "live",
        currentStep: "colour",
        allowedOptions: ["classic", "mood"],
        params: { _signupsOpen: true, _votesOpen: true },
      }),
    );
    expect(created.status).toBe(200);
    const session = (await created.json()) as {
      id: string;
      viewer_key: string;
    };
    expect(
      (
        await sessions.GET(
          new NextRequest("http://localhost/api/stream/sessions?limit=10"),
        )
      ).status,
    ).toBe(200);
    const updated = await sessions.PATCH(
      json(
        "http://localhost/api/stream/sessions",
        {
          operation: "update",
          id: session.id,
          currentStep: "coat",
          allowedOptions: ["classic"],
        },
        "PATCH",
      ),
    );
    expect(updated.status).toBe(200);

    const participantResponse = await participants.POST(
      json("http://localhost/api/stream/participants", {
        operation: "create",
        sessionId: session.id,
        viewerSession: "r".repeat(32),
        displayName: "Route viewer",
        status: "active",
      }),
    );
    expect(participantResponse.status).toBe(200);
    const participant = (await participantResponse.json()) as { id: string };
    const vote = await votes.POST(
      json("http://localhost/api/stream/votes", {
        sessionId: session.id,
        stepId: "coat",
        optionKey: "classic",
        voteRound: 1,
        votedBy: participant.id,
        viewerSession: "r".repeat(32),
      }),
    );
    expect(vote.status).toBe(200);
  });

  it("returns the error contract for anonymous host operations and malformed input", async () => {
    getRequestIdentity.mockResolvedValue({ tokenIdentifier: null });
    const denied = await sessions.POST(
      json("http://localhost/api/stream/sessions", {
        operation: "create",
        viewerKey: "denied",
        status: "live",
      }),
    );
    expect(denied.status).toBe(403);
    getRequestIdentity.mockResolvedValue(identity);
    const invalid = await sessions.POST(
      json("http://localhost/api/stream/sessions", { operation: "create" }),
    );
    expect(invalid.status).toBe(400);
    const invalidParticipant = await participants.POST(
      json("http://localhost/api/stream/participants", { operation: "create" }),
    );
    expect(invalidParticipant.status).toBe(400);
    const invalidVote = await votes.POST(
      json("http://localhost/api/stream/votes", { stepId: "colour" }),
    );
    expect(invalidVote.status).toBe(400);
  });
});
