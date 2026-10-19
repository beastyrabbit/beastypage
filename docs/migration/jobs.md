# PostgreSQL jobs

The `jobs` table stores asynchronous work. The worker is started from
`frontend/instrumentation.ts` when the server runs on Node, is not in the
production build phase, maintenance mode is off, and `JOBS_ENABLED` is not
`"0"`. There is no backend switch. Set `JOBS_ENABLED=0` to disable the worker
without changing the application routes.

## Adding a kind

Create a module under `frontend/server/jobs/kinds/` with a Zod object payload
schema, a handler, a maximum attempt count, and a lease length. A handler
receives the
validated payload and `{ db, jobId, kind, attempt, signal }`; return a small
object of numeric counts for the run history. Add the definition to the array
in `frontend/server/jobs/kinds/index.ts`.

Enqueue from the caller's Drizzle transaction:

```ts
await enqueueJob(tx, {
  kind: "catdex.thumbnail",
  dedupeKey: catId,
  payload: { id: catId, attempt: 1 },
  runAfter: new Date(Date.now() + 30_000),
});
```

The payload is checked before insertion and again when claimed. A malformed
row is marked `dead`, recorded in `job_runs`, and emitted as one structured
`job_dead` log line. `dedupeKey` is optional; when present, only one pending or
running job for that kind and key can exist. Notifications are committed with
the insert, so a rolled-back transaction never wakes a worker.

## Delayed and recurring jobs

Use `runAfter` for delayed work. Workers sleep until the earliest pending
`run_after` or a `NOTIFY beastypage_jobs`; they do not use polling. Wake
notifications are retained across a pump, so a notification that arrives while
the due-job query is running is reconciled by the next loop. The dedicated
LISTEN connection reconnects with backoff after a connection failure. A
recurring kind sets `recurringIntervalMs`, `recurringDedupeKey`, and
`recurringPayload`.
The worker installs a missing singleton at startup and each terminal run
enqueues the next occurrence in the same transaction as its completion.

The built-in `live.prune` kind runs hourly and removes `live_events` older than
one hour. `jobs.prune` runs daily, removes finished jobs older than 30 days,
and removes `job_runs` older than 30 days.

## Operations

`GET /api/internal/jobs/status` reports counts by kind and status, dead jobs
with their last error, and the most recent run history. It requires an admin
Clerk identity whose token identifier in `issuer|subject` form is listed in
`QUICK_SHARE_ADMIN_TOKEN_IDENTIFIERS`; comparisons are constant-time.

Set `JOBS_ENABLED=0` to stop workers without changing application data routes.
Expired leases are recovered every ten minutes. A retry uses exponential
backoff starting at five seconds and capped at one hour, with jitter; after
`maxAttempts` the job remains `dead` until inspected or removed by retention.
Process shutdown stops new claims synchronously, but draining in-flight jobs is
best-effort because the hosting server may exit immediately. Lease expiry
recovers interrupted work, and job kinds must remain idempotent so retries are
safe.
