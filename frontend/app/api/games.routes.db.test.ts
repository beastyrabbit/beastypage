import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { closeDatabase } from "@/server/db/client";

vi.mock("@/server/auth/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth/identity")>()),
  getRequestIdentity: vi.fn(async () => ({ tokenIdentifier: null })),
}));

let perfectRegister: typeof import("./perfect-cats/register/route");
let perfectMatchup: typeof import("./perfect-cats/matchup/route");
let perfectVote: typeof import("./perfect-cats/vote/route");
let perfectLeaderboard: typeof import("./perfect-cats/leaderboard/route");
let coinflipScore: typeof import("./coinflip/score/route");
let coinflipLeaderboard: typeof import("./coinflip/leaderboard/route");
let coinflipScores: typeof import("./coinflip/scores/route");
let wheelSpin: typeof import("./wheel/spin/route");
let wheelStats: typeof import("./wheel/stats/route");

function json(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  process.env.DATABASE_URL = inject("databaseUrl");
  perfectRegister = await import("./perfect-cats/register/route");
  perfectMatchup = await import("./perfect-cats/matchup/route");
  perfectVote = await import("./perfect-cats/vote/route");
  perfectLeaderboard = await import("./perfect-cats/leaderboard/route");
  coinflipScore = await import("./coinflip/score/route");
  coinflipLeaderboard = await import("./coinflip/leaderboard/route");
  coinflipScores = await import("./coinflip/scores/route");
  wheelSpin = await import("./wheel/spin/route");
  wheelStats = await import("./wheel/stats/route");
});
afterAll(async () => closeDatabase());

describe("games API routes", () => {
  it("registers cats and returns a matchup", async () => {
    const registration = await perfectRegister.POST(
      json("http://localhost/api/perfect-cats/register", {
        cats: [
          { params: { params: {}, name: `route-${Date.now()}-a` } },
          { params: { params: {}, name: `route-${Date.now()}-b` } },
        ],
      }),
    );
    expect(registration.status).toBe(200);
    const matchup = await perfectMatchup.POST(
      json("http://localhost/api/perfect-cats/matchup", {
        clientId: `route-client-${Date.now()}`,
      }),
    );
    expect(matchup.status).toBe(200);
    const matchupBody = await matchup.json();
    expect(matchupBody.cats).toHaveLength(2);
    const vote = await perfectVote.POST(
      json("http://localhost/api/perfect-cats/vote", {
        clientId: matchupBody.clientId,
        winnerId: matchupBody.cats[0].id,
        loserId: matchupBody.cats[1].id,
        matchupToken: matchupBody.matchupToken,
      }),
    );
    expect(vote.status).toBe(200);
    expect(
      (
        await perfectLeaderboard.GET(
          new Request("http://localhost/api/perfect-cats/leaderboard?limit=2"),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await coinflipLeaderboard.GET(
          new Request("http://localhost/api/coinflip/leaderboard?limit=2"),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await coinflipScores.GET(
          new Request("http://localhost/api/coinflip/scores?limit=2"),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await wheelStats.GET(
          new Request("http://localhost/api/wheel/stats?limit=2"),
        )
      ).status,
    ).toBe(200);
  });

  it("returns the error contract for malformed score and forbidden forced spin", async () => {
    const score = await coinflipScore.POST(
      json("http://localhost/api/coinflip/score", { name: "", score: 0 }),
    );
    expect(score.status).toBe(400);
    expect(await score.json()).toMatchObject({ code: "invalid_input" });
    const spin = await wheelSpin.POST(
      json("http://localhost/api/wheel/spin", {
        prizeName: "Moondust",
        forced: true,
        randomBucket: 0,
      }),
    );
    expect(spin.status).toBe(403);
    expect(await spin.json()).toMatchObject({ code: "forbidden" });
  });

  it("returns invalid-input responses for every games route", async () => {
    const cases = [
      perfectRegister.POST(
        json("http://localhost/api/perfect-cats/register", { cats: [] }),
      ),
      perfectMatchup.POST(
        json("http://localhost/api/perfect-cats/matchup", {
          clientId: "x".repeat(129),
        }),
      ),
      perfectMatchup.POST(
        json("http://localhost/api/perfect-cats/matchup", {}),
      ),
      perfectVote.POST(
        json("http://localhost/api/perfect-cats/vote", { clientId: "x" }),
      ),
      perfectLeaderboard.GET(
        new Request("http://localhost/api/perfect-cats/leaderboard?limit=0"),
      ),
      coinflipLeaderboard.GET(
        new Request("http://localhost/api/coinflip/leaderboard?limit=0"),
      ),
      coinflipScores.GET(
        new Request("http://localhost/api/coinflip/scores?limit=0"),
      ),
      coinflipScore.POST(
        json("http://localhost/api/coinflip/score", { name: "x" }),
      ),
      wheelSpin.POST(
        json("http://localhost/api/wheel/spin", {
          prizeName: "Moondust",
          forced: false,
          randomBucket: 100,
        }),
      ),
      wheelStats.GET(new Request("http://localhost/api/wheel/stats?limit=0")),
    ];
    for (const response of await Promise.all(cases)) {
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: "invalid_input" });
    }
  });
});
