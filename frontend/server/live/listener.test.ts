import { describe, expect, it } from "vitest";
import { createLiveListenerForTests, type LiveEvent } from "./listener";

interface Row {
  id: number;
  topic: string;
  revision: number;
  created_at: Date;
}

class FakeClient {
  private readonly handlers = new Map<
    string,
    Set<(...args: never[]) => void>
  >();

  constructor(
    private readonly rows: Row[],
    private readonly baseline: number,
  ) {}

  async connect(): Promise<void> {}

  async query<T = unknown>(
    query: string,
    values?: readonly unknown[],
  ): Promise<{ rows: T[] }> {
    if (query.startsWith("LISTEN")) return { rows: [] as T[] };
    if (query.includes("coalesce(max(id)")) {
      return { rows: [{ max_id: this.baseline }] as T[] };
    }
    const cursor = Number(values?.[0] ?? 0);
    return {
      rows: this.rows.filter((row) => row.id > cursor).slice(0, 500) as T[],
    };
  }

  async end(): Promise<void> {}

  on(event: string, handler: (...args: never[]) => void): this {
    let handlers = this.handlers.get(event);
    if (!handlers) {
      handlers = new Set();
      this.handlers.set(event, handlers);
    }
    handlers.add(handler);
    return this;
  }

  removeAllListeners(): this {
    this.handlers.clear();
    return this;
  }
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() >= deadline)
      throw new Error("Timed out waiting for listener");
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

describe("live event listener replay", () => {
  it("baselines a first connection without replaying retained rows", async () => {
    const events: LiveEvent[] = [];
    const client = new FakeClient(
      [
        {
          id: 42,
          topic: "test/topic",
          revision: 7,
          created_at: new Date(),
        },
      ],
      42,
    );
    const listener = createLiveListenerForTests({
      createClient: () => client,
    });
    listener.subscribe("test/topic", (event) => {
      events.push(event);
    });

    await listener.waitUntilReady();
    expect(listener.processedEventId).toBe(42);
    expect(events).toEqual([]);
    await listener.stop();
  });

  it("replays in batches and coalesces each topic to its highest revision", async () => {
    const rows: Row[] = Array.from({ length: 501 }, (_, index) => ({
      id: index + 1,
      topic: "test/a",
      revision: index + 1,
      created_at: new Date(),
    }));
    rows.push(
      {
        id: 502,
        topic: "test/b",
        revision: 2,
        created_at: new Date(),
      },
      {
        id: 503,
        topic: "test/b",
        revision: 5,
        created_at: new Date(),
      },
    );
    const first = new FakeClient([], 0);
    const second = new FakeClient(rows, 0);
    const clients = [first, second];
    const events = new Map<string, LiveEvent[]>();
    const listener = createLiveListenerForTests({
      createClient: () => clients.shift() ?? second,
      reconnectBaseMs: 1,
      reconnectMaxMs: 2,
    });
    for (const topic of ["test/a", "test/b"]) {
      events.set(topic, []);
      listener.subscribe(topic, (event) => {
        events.get(topic)?.push(event);
      });
    }

    await listener.waitUntilReady();
    await listener.disconnectForTests();
    await waitFor(
      () =>
        events.get("test/a")?.length === 1 &&
        events.get("test/b")?.length === 1,
    );

    expect(events.get("test/a")?.[0]?.revision).toBe(501);
    expect(events.get("test/b")?.[0]?.revision).toBe(5);
    expect(listener.processedEventId).toBe(503);
    await listener.stop();
  });
});
