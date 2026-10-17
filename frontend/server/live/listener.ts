import "server-only";

import pg from "pg";
import { readDatabaseConfig } from "@/server/db/config";
import { LIVE_CHANNEL } from "@/server/live/publish";

export interface LiveEvent {
  id: number;
  topic: string;
  revision: number;
  createdAt: Date;
}

export type LiveSubscriber = (event: LiveEvent) => void | Promise<void>;

interface ListenerClient {
  connect(): Promise<void>;
  query<T = unknown>(
    query: string,
    values?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
  end(): Promise<void>;
  on(
    event: "notification",
    listener: (message: { channel: string; payload?: string }) => void,
  ): this;
  on(event: "error" | "end", listener: (...args: never[]) => void): this;
  removeAllListeners(): this;
}

export interface LiveListenerOptions {
  createClient?: () => ListenerClient;
  now?: () => Date;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
}

const DEFAULT_RECONNECT_BASE_MS = 100;
const DEFAULT_RECONNECT_MAX_MS = 5_000;
const CATCH_UP_BATCH_SIZE = 500;

function createListenerClient(): ListenerClient {
  const config = readDatabaseConfig("app");
  return new pg.Client({
    connectionString: config.url,
    application_name: `${config.applicationName}-live`,
    connectionTimeoutMillis: config.connectTimeoutMs,
    statement_timeout: config.statementTimeoutMs || undefined,
    lock_timeout: config.lockTimeoutMs || undefined,
    idle_in_transaction_session_timeout:
      config.idleInTransactionTimeoutMs || undefined,
    query_timeout: config.statementTimeoutMs
      ? config.statementTimeoutMs + 2_000
      : undefined,
  }) as unknown as ListenerClient;
}

interface EventRow {
  id: number;
  topic: string;
  revision: number;
  created_at: Date;
}

/**
 * One dedicated LISTEN connection per process. It never checks a client out of
 * the application pool, because a pooled checkout held for the process would
 * consume one application connection permanently.
 */
export class LiveEventListener {
  private readonly createClient: () => ListenerClient;
  private readonly now: () => Date;
  private readonly reconnectBaseMs: number;
  private readonly reconnectMaxMs: number;
  private readonly subscribers = new Map<string, Set<LiveSubscriber>>();
  private client: ListenerClient | null = null;
  private connectPromise: Promise<void> | null = null;
  private catchupPromise: Promise<void> | null = null;
  private catchupRequested = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay: number;
  private stopped = true;
  private connectedOnce = false;
  private lastEventId = 0;
  private readonly readyWaiters: Array<() => void> = [];

  constructor(options: LiveListenerOptions = {}) {
    this.createClient = options.createClient ?? createListenerClient;
    this.now = options.now ?? (() => new Date());
    this.reconnectBaseMs = options.reconnectBaseMs ?? DEFAULT_RECONNECT_BASE_MS;
    this.reconnectMaxMs = options.reconnectMaxMs ?? DEFAULT_RECONNECT_MAX_MS;
    this.reconnectDelay = this.reconnectBaseMs;
  }

  get processedEventId(): number {
    return this.lastEventId;
  }

  /** Resolves after the first LISTEN connection has replayed its baseline. */
  waitUntilReady(): Promise<void> {
    if (this.connectedOnce && this.client) return Promise.resolve();
    return new Promise((resolve) => this.readyWaiters.push(resolve));
  }

  subscribe(topic: string, subscriber: LiveSubscriber): () => void {
    let topicSubscribers = this.subscribers.get(topic);
    if (!topicSubscribers) {
      topicSubscribers = new Set();
      this.subscribers.set(topic, topicSubscribers);
    }
    topicSubscribers.add(subscriber);
    this.stopped = false;
    this.ensureConnected();

    return () => {
      const current = this.subscribers.get(topic);
      current?.delete(subscriber);
      if (current?.size === 0) this.subscribers.delete(topic);
    };
  }

  /** Starts the connection without adding a subscription. Primarily useful in tests. */
  start(): void {
    this.stopped = false;
    this.ensureConnected();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const client = this.client;
    this.client = null;
    this.connectPromise = null;
    this.catchupPromise = null;
    this.catchupRequested = false;
    if (client) {
      client.removeAllListeners();
      await client.end().catch(() => undefined);
    }
  }

  /** Test hook for simulating a dropped connection. */
  async disconnectForTests(): Promise<void> {
    const client = this.client;
    if (!client) return;
    this.client = null;
    client.removeAllListeners();
    await client.end().catch(() => undefined);
    this.scheduleReconnect();
  }

  private ensureConnected(): void {
    if (this.stopped || this.client || this.connectPromise) return;
    this.connectPromise = this.connect().finally(() => {
      this.connectPromise = null;
    });
  }

  private async connect(): Promise<void> {
    const client = this.createClient();
    this.client = client;
    let disconnected = false;
    const disconnect = () => {
      if (disconnected || this.client !== client) return;
      disconnected = true;
      this.client = null;
      client.removeAllListeners();
      this.scheduleReconnect();
    };

    client.on("notification", (message) => {
      if (message.channel === LIVE_CHANNEL) this.scheduleCatchup();
    });
    client.on("error", disconnect);
    client.on("end", disconnect);

    try {
      await client.connect();
      await client.query(`LISTEN ${LIVE_CHANNEL}`);
      if (this.stopped || this.client !== client) return;
      const catchupPromise = this.catchUp(client);
      this.catchupPromise = catchupPromise;
      let catchupSucceeded = false;
      try {
        await catchupPromise;
        catchupSucceeded = true;
      } finally {
        if (this.catchupPromise === catchupPromise) {
          this.catchupPromise = null;
          if (catchupSucceeded) {
            this.connectedOnce = true;
          } else {
            this.catchupRequested = false;
          }
          if (catchupSucceeded && this.catchupRequested) {
            this.catchupRequested = false;
            this.scheduleCatchup();
          }
        }
      }
      this.reconnectDelay = this.reconnectBaseMs;
      const waiters = this.readyWaiters.splice(0);
      for (const resolve of waiters) resolve();
    } catch {
      disconnect();
      await client.end().catch(() => undefined);
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer || this.subscribers.size === 0)
      return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(
      this.reconnectMaxMs,
      Math.max(this.reconnectBaseMs, this.reconnectDelay * 2),
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureConnected();
    }, delay);
  }

  private scheduleCatchup(): void {
    if (this.stopped || !this.client) return;
    if (this.catchupPromise) {
      this.catchupRequested = true;
      return;
    }
    const client = this.client;
    const catchupPromise = this.catchUp(client).catch((error) => {
      console.error(
        "[live] event replay failed",
        error instanceof Error ? error.message : error,
      );
      if (this.client === client) {
        this.client = null;
        client.removeAllListeners();
        void client.end().catch(() => undefined);
        this.scheduleReconnect();
      }
    });
    this.catchupPromise = catchupPromise;
    void catchupPromise.finally(() => {
      if (this.catchupPromise !== catchupPromise) return;
      this.catchupPromise = null;
      if (this.catchupRequested) {
        this.catchupRequested = false;
        this.scheduleCatchup();
      }
    });
  }

  private async catchUp(
    client: ListenerClient | null = this.client,
  ): Promise<void> {
    if (!client || this.stopped) return;

    if (!this.connectedOnce) {
      const result = await client.query<{ max_id: number | string | null }>(
        "select coalesce(max(id), 0) as max_id from live_events",
      );
      this.lastEventId = Number(result.rows[0]?.max_id ?? 0);
      return;
    }

    const events = new Map<string, LiveEvent>();
    let sawRows = false;
    let checkedGap = false;
    for (;;) {
      const rows = await client
        .query<EventRow>(
          `select id, topic, revision, created_at
             from live_events where id > $1 order by id asc limit ${CATCH_UP_BATCH_SIZE}`,
          [this.lastEventId],
        )
        .then((result) => result.rows);
      if (rows.length === 0) break;
      sawRows = true;

      if (!checkedGap) {
        checkedGap = true;
        const firstEventId = Number(rows[0].id);
        if (firstEventId > this.lastEventId + 1) {
          for (const topic of this.subscribers.keys()) {
            events.set(topic, {
              id: firstEventId,
              topic,
              revision: 0,
              createdAt: this.now(),
            });
          }
        }
      }

      for (const row of rows) {
        const id = Number(row.id);
        this.lastEventId = Math.max(this.lastEventId, id);
        const event: LiveEvent = {
          id,
          topic: row.topic,
          revision: Number(row.revision),
          createdAt: row.created_at,
        };
        const previous = events.get(event.topic);
        if (
          !previous ||
          event.revision > previous.revision ||
          (event.revision === previous.revision && event.id > previous.id)
        ) {
          events.set(event.topic, event);
        }
      }

      if (rows.length < CATCH_UP_BATCH_SIZE) break;
    }

    if (!sawRows) {
      // A reconnect can occur after all events in the gap were pruned. There
      // is then no row from which to infer the gap, so refresh subscriptions
      // conservatively once a process has already had a connection.
      if (this.lastEventId > 0) this.refreshSubscribedTopics(this.lastEventId);
      return;
    }

    for (const event of events.values()) {
      this.dispatch(event);
    }
  }

  private dispatch(event: LiveEvent): void {
    const subscribers = this.subscribers.get(event.topic);
    if (!subscribers) return;
    for (const subscriber of subscribers) {
      try {
        void Promise.resolve(subscriber(event)).catch((error) => {
          console.error("[live] subscriber failed", error);
        });
      } catch (error) {
        console.error("[live] subscriber failed", error);
      }
    }
  }

  private refreshSubscribedTopics(eventId: number): void {
    for (const topic of this.subscribers.keys()) {
      this.dispatch({
        id: eventId,
        topic,
        revision: 0,
        createdAt: this.now(),
      });
    }
  }
}

const globalForLive = globalThis as typeof globalThis & {
  __beastypageLiveListener?: LiveEventListener;
  __beastypageLiveShutdownRegistered?: boolean;
};

export function getLiveListener(): LiveEventListener {
  if (!globalForLive.__beastypageLiveShutdownRegistered) {
    globalForLive.__beastypageLiveShutdownRegistered = true;
    process.once("SIGTERM", () => void stopLiveListener());
    process.once("SIGINT", () => void stopLiveListener());
  }
  globalForLive.__beastypageLiveListener ??= new LiveEventListener();
  return globalForLive.__beastypageLiveListener;
}

export function subscribeLive(
  topic: string,
  subscriber: LiveSubscriber,
): () => void {
  return getLiveListener().subscribe(topic, subscriber);
}

export function startLiveListener(): void {
  getLiveListener().start();
}

export function waitForLiveReady(): Promise<void> {
  return getLiveListener().waitUntilReady();
}

export async function stopLiveListener(): Promise<void> {
  await globalForLive.__beastypageLiveListener?.stop();
}

export function createLiveListenerForTests(
  options: LiveListenerOptions = {},
): LiveEventListener {
  return new LiveEventListener({
    reconnectBaseMs: options.reconnectBaseMs ?? 5,
    reconnectMaxMs: options.reconnectMaxMs ?? 100,
    ...options,
  });
}
