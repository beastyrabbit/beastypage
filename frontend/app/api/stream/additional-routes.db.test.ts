import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { closeDatabase, getDb } from "@/server/db/client";
import type { Database } from "@/server/db/pool";
import { ensureCatStreamSession } from "@/server/services/catStream";
import { createStreamSession } from "@/server/services/stream";
import { getOrCreateUser } from "@/server/services/users";

const identity = {
  tokenIdentifier: `https://stream-routes.test|${crypto.randomUUID()}`,
};
const otherIdentity = {
  tokenIdentifier: `https://stream-routes.test|${crypto.randomUUID()}`,
};
const getRequestIdentity = vi.fn(async () => identity);
vi.mock("@/server/auth/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth/identity")>()),
  getRequestIdentity,
}));

let db: Database;
let catStream: typeof import("../cat-stream/route");
let catStreamById: typeof import("../cat-stream/[id]/route");
let sessionsById: typeof import("./sessions/[id]/route");
let streamVotesAlias: typeof import("../stream-votes/route");
let streamWheel: typeof import("../stream-wheel/route");

function json(url: string, body: unknown, method = "POST") {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  process.env.DATABASE_URL = inject("databaseUrl");
  db = getDb();
  [catStream, catStreamById, sessionsById, streamVotesAlias, streamWheel] =
    await Promise.all([
      import("../cat-stream/route"),
      import("../cat-stream/[id]/route"),
      import("./sessions/[id]/route"),
      import("../stream-votes/route"),
      import("../stream-wheel/route"),
    ]);
});

afterAll(async () => {
  await closeDatabase();
});

describe("stream route coverage", () => {
  it("covers cat-stream root, id and wheel routes", async () => {
    const user = await getOrCreateUser(db, identity);
    const sessionId = await ensureCatStreamSession(db, identity, {
      overlayTheme: "dark",
    });
    const loaded = await catStream.GET(
      new NextRequest(
        `http://localhost/api/cat-stream?key=${encodeURIComponent(user.apiKey ?? "")}`,
      ),
    );
    expect(loaded.status).toBe(200);
    expect(((await loaded.json()) as { id: string }).id).toBe(sessionId);
    const byId = await catStreamById.GET(
      new NextRequest(
        `http://localhost/api/cat-stream/${sessionId}?key=${encodeURIComponent(user.apiKey ?? "")}`,
      ),
      { params: Promise.resolve({ id: sessionId }) },
    );
    expect(byId.status).toBe(200);
    const wrongById = await catStreamById.GET(
      new NextRequest(
        `http://localhost/api/cat-stream/${sessionId}?key=wrong-key`,
      ),
      { params: Promise.resolve({ id: sessionId }) },
    );
    expect(wrongById.status).toBe(404);
    const invalid = await catStream.POST(
      json("http://localhost/api/cat-stream", { operation: "triggerSpin" }),
    );
    expect(invalid.status).toBe(400);
    const spin = await catStream.POST(
      json("http://localhost/api/cat-stream", {
        operation: "triggerSpin",
        params: { colour: "BLACK" },
      }),
    );
    expect(spin.status).toBe(200);
    const wheel = await streamWheel.POST(
      new NextRequest("http://localhost/api/stream-wheel", { method: "POST" }),
    );
    expect(wheel.status).toBe(200);
    expect((await wheel.json()) as { forced: boolean }).toHaveProperty(
      "forced",
      false,
    );
    getRequestIdentity.mockResolvedValue(otherIdentity);
    const deniedWheel = await streamWheel.POST(
      new NextRequest("http://localhost/api/stream-wheel", { method: "POST" }),
    );
    expect(deniedWheel.status).toBe(404);
    getRequestIdentity.mockResolvedValue(identity);
  });

  it("covers the session id route and the stream-votes compatibility alias", async () => {
    const session = await createStreamSession(
      db,
      {
        viewerKey: `route-id-viewer-${crypto.randomUUID()}`,
        status: "live",
        currentStep: "colour",
        allowedOptions: ["classic"],
        params: { _votesOpen: true, _signupsOpen: true },
      },
      identity,
    );
    const publicRead = await sessionsById.GET(
      new NextRequest(`http://localhost/api/stream/sessions/${session?.id}`),
      { params: Promise.resolve({ id: session?.id ?? "" }) },
    );
    expect(publicRead.status).toBe(200);
    getRequestIdentity.mockResolvedValue(otherIdentity);
    const deniedHostRead = await sessionsById.GET(
      new NextRequest(
        `http://localhost/api/stream/sessions/${session?.id}?host=1`,
      ),
      { params: Promise.resolve({ id: session?.id ?? "" }) },
    );
    expect(deniedHostRead.status).toBe(404);
    getRequestIdentity.mockResolvedValue(identity);
    const aliasRead = await streamVotesAlias.GET(
      new NextRequest(
        `http://localhost/api/stream-votes?session=${session?.id}&limit=1`,
      ),
    );
    expect(aliasRead.status).toBe(200);
    expect(await aliasRead.json()).toEqual([]);
    const aliasInvalid = await streamVotesAlias.POST(
      json("http://localhost/api/stream-votes", { optionKey: "classic" }),
    );
    expect(aliasInvalid.status).toBe(400);
  });
});
