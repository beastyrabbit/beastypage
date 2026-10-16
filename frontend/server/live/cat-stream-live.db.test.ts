import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { closeDatabase, getDb } from "@/server/db/client";
import type { Database } from "@/server/db/pool";
import { stopLiveListener } from "@/server/live/listener";
import {
  ensureCatStreamSession,
  getCatStreamSession,
  updateCatStreamSettings,
} from "@/server/services/catStream";
import { getOrCreateUser } from "@/server/services/users";

const { getRequestIdentity } = vi.hoisted(() => ({
  getRequestIdentity: vi.fn(async () => ({ tokenIdentifier: null })),
}));
vi.mock("@/server/auth/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth/identity")>()),
  getRequestIdentity,
}));

let db: Database;
let route: typeof import("@/app/api/live/[...topic]/route");

async function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs = 2_000,
) {
  const result = await Promise.race([
    reader.read(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Timed out waiting for SSE")),
        timeoutMs,
      ),
    ),
  ]);
  return result.done ? "" : new TextDecoder().decode(result.value);
}

beforeAll(async () => {
  process.env.DATA_BACKEND = "postgres";
  process.env.DATABASE_URL = inject("databaseUrl");
  db = getDb();
  route = await import("@/app/api/live/[...topic]/route");
});

afterAll(async () => {
  await stopLiveListener();
  await closeDatabase();
});

describe("cat stream live topic", () => {
  it("delivers a control write to an authorized overlay SSE subscriber", async () => {
    const identity = {
      tokenIdentifier: `https://cat-stream-live.test|${crypto.randomUUID()}`,
    };
    const user = await getOrCreateUser(db, identity);
    if (!user.apiKey) throw new Error("user API key was not created");
    const sessionId = await ensureCatStreamSession(db, identity);
    const session = await getCatStreamSession(db, identity);
    if (!session || session.id !== sessionId)
      throw new Error("stream session was not created");
    const controller = new AbortController();
    const response = await route.GET(
      new NextRequest(
        `http://localhost/api/live/cat-stream/${session.id}?key=${encodeURIComponent(user.apiKey)}`,
        { signal: controller.signal },
      ),
      { params: Promise.resolve({ topic: ["cat-stream", session.id] }) },
    );
    expect(response.status).toBe(200);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("SSE response has no body");
    const initial = await readChunk(reader);
    const initialRevision = Number(
      /"revision":(\d+)/.exec(initial)?.[1] ?? "0",
    );
    expect(initialRevision).toBeGreaterThan(0);

    const wrongKey = await route.GET(
      new NextRequest(
        `http://localhost/api/live/cat-stream/${session.id}?key=wrong-key`,
      ),
      { params: Promise.resolve({ topic: ["cat-stream", session.id] }) },
    );
    expect(wrongKey.status).toBe(403);

    await updateCatStreamSettings(db, identity, {
      ...((session.settings as Record<string, unknown>) ?? {}),
      resultAutoClearSeconds: 42,
    });
    const update = await readChunk(reader);
    const updateRevision = Number(/"revision":(\d+)/.exec(update)?.[1] ?? "0");
    expect(updateRevision).toBeGreaterThan(initialRevision);

    controller.abort();
    await reader.cancel();
  });
});
