# Live updates

Live updates publish the latest state of PostgreSQL-backed aggregates. A write
bumps the aggregate revision, inserts one `live_events` row, and calls
`pg_notify('beastypage_live', topic)` in the same transaction.
PostgreSQL delivers the notification only after commit. The notification
contains the topic only; snapshots and other data stay in PostgreSQL.

Each frontend process creates one dedicated `LISTEN beastypage_live` connection
when the first SSE subscriber arrives. The first connection baselines at the
current maximum `live_events.id`, so retained history is not replayed to a new
process. The listener remembers the highest ID, replays rows after reconnect in batches
of 500 rows, and coalesces each topic to one refresh per catch-up. If pruning
has removed part of the replay window (the retention window is one hour), every
subscribed topic is refreshed. SSE sends an
authorized snapshot with `id: <revision>` and an `{ revision, data }` envelope,
suppresses revisions that are not newer, emits a heartbeat every 15 seconds,
closes after 15 minutes, and closes sooner when the client applies sustained
backpressure so it can reconnect with `Last-Event-ID`.

## Adding a topic

Create a descriptor in `frontend/server/live/topics/` that implements
`LiveTopicDefinition`:

1. Parse one stable topic string (for example, `stream/<session-id>`).
2. Perform exactly the credential check used by the corresponding read. Return
   an authorization value or `null` to reject the request.
3. Load `{ revision, data }` through the same authorized read path.
4. Add the descriptor to `liveTopics` in `topics/index.ts`.

The write path bumps the aggregate revision and calls `publishLive(tx, topic,
revision)` before the transaction returns. Do not put aggregate data in the
topic or the NOTIFY payload. The test-only `test/<name>` descriptor is omitted
when `NODE_ENV=production`.

## Verification

Start the worktree database and run migrations, then run the database project:

```sh
pnpm --dir frontend run db:local up
pnpm --dir frontend run db:migrate
pnpm --dir frontend run test:db -- server/live/live.db.test.ts
```

The database test covers commit-only notifications, reconnect gap replay, SSE
authorization and revision suppression, pruning, and three independent
listener processes. The three-replica case publishes 20 revisions and reports
the measured publish-to-receive p50 and p95; p95 must stay below the one-second
hard limit (the ADR target is 250 ms).

Measured on the local PostgreSQL 18 test database with three replicas and 20
revisions: **p50: 3 ms; p95: 4 ms**. These values are a local reference point;
the test enforces the one-second hard limit in every run.
