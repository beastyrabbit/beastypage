# Convex → PostgreSQL migration status

The migration is forward-only (ADR 0001 §1). **Production still runs on
Convex.** Nothing here has been deployed. No production export, secret
change, homelab change, release tag or cutover has happened. One
test export of production was taken on 2026-10-16 by the maintainer and is
kept outside the repository.

Status as of 2026-10-17, branch `t3code/convex-postgres-migration`.
Every area now has a PostgreSQL implementation behind `DATA_BACKEND=postgres`;
Convex stays the default until the cutover.

| Phase | Issue | State | Evidence in the repository | Still open |
| --- | --- | --- | --- | --- |
| 1. Inventory and architecture | #105 | **Done** | `frontend/scripts/migration/convex-inventory.ts` (`--check` in CI), [`convex-inventory.md`](convex-inventory.md), [ADR 0001](adr-0001-postgresql.md) | Machine-linked blockers between the issues |
| Production measurement and export | #106 | **Test export taken** (349 MB archive, SHA-256 recorded privately) | [`importer.md`](importer.md) | Actual export cost from the Convex usage page |
| 2. PostgreSQL foundation | #108 | **Repository side done** | Drizzle, `db:local`, the CI `database` job, the migration runner with lock, version and fail-closed check, the bundled init-container runner, [`operations.md`](operations.md), `deploy/postgres/*` templates | kub-homelab CNPG cluster, Infisical paths, restore drill (need approval) |
| 3. Target schema and contracts | #107, #109 | **Done**; validated on the real archive | `server/db/schema/*`, `server/db/contracts.ts`, `drizzle/0000_init.sql`, `drizzle/0001_quick_share_collection_slugs.sql` (Quick Share collection items share one slug; expand-only), [`data-contract.md`](data-contract.md) | Counts on #107 |
| Image storage | #110 | **Done** | `files` table (`bytea`; 333 referenced images, 167 MB), `/api/files/[id]`, one decoding write path `storeFile` for uploads and generated images, `files.orphan-cleanup` job that fails closed when a new file reference column appears | — |
| 4. Importer | #111 | **Done**; runs cleanly on the real archive | `scripts/migration/import*`, [`importer.md`](importer.md) | Counts on #111 (3 expected quarantined rows owned by a deleted user are dropped by decision) |
| Staging data | #112 | **Tooling done** | `scrub:staging` (HMAC pseudonyms, regenerated tokens, staging password, `--verify`, loopback/explicit-database guard), [`staging.md`](staging.md) | Staging namespace and scrubbed archive (approval) |
| 5. Server data layer | #113 | **Done** | Repositories, services and zod-validated routes for every area, dual-path client hooks (`lib/data/*`, TanStack Query), Convex-vs-PostgreSQL parity tests per area; area maps in [`areas/`](areas/) (catalog, cats, users, games, quick-share, stream) | — |
| 6. Live updates | #114 | **Done** | `server/live/*` (publish in the writing transaction, one LISTEN per process with gap replay), `/api/live/[...topic]` SSE, `lib/live`, stream topics; three-replica test p95 ≈ 4 ms; browser check: control write reached the overlay in 26 ms; [`live-updates.md`](live-updates.md) | Measure again in the cluster |
| 7. Jobs and HTTP routes | #115 | **Done** | `server/jobs/*` worker (SKIP LOCKED leases, backoff, dead jobs, recurring singletons), all crons and `scheduler.runAfter` sites as job kinds, `/api/internal/jobs/status`, the five HTTP routes, media `CONTROL_PLANE_URL` (falls back to Convex); [`jobs.md`](jobs.md) | — |
| 8. Cutover | #116 | **Runbook and tools done** | `MAINTENANCE_MODE` gate (proxy 503 for writes, jobs paused, banner), `verify:import` (passes on the real archive: 35 tables, 336 files), `smoke:cutover`, [`cutover.md`](cutover.md) | Staging rehearsal, restore drill, approvals, the window itself |
| 9. Decommission | #117 | Not started | — | After cutover: remove Convex code, `DATA_BACKEND`, the Convex provider (its websocket still connects in PostgreSQL mode), the dual-path hooks |

## Independent review (2026-10-17)

Four read-only reviewers (security, Convex parity, concurrency, cutover)
checked the whole branch. Security found nothing. The other three found 29
issues, all confirmed against the code and fixed with tests; the ones that
would have broken the cutover:

- the app role was never granted access to the tables (the migration runner
  now applies the grants; the test migrates as a non-superuser owner);
- client auth state still came from Convex, so the stream control and host
  pages would hang once Convex was paused (`useBackendAuth`, Clerk in
  PostgreSQL mode);
- the importer could truncate an unintended database (explicit import URL,
  `--expected-database`, `--confirm-remote-replace`, mandatory issuer).

The rest: Quick Share collection order and null items, wheel `forcedCount`,
exact-case usernames and derived usernames for new users, upload-limit and
default-row races, the job worker's lost wake and missing LISTEN reconnect,
bounded live replay, SSE backpressure, worker shutdown, the thumbnail job's
lock scope, and runbook command errors.

## Validation run for this state

All commands run from `frontend/` on 2026-10-17.

| Check | Command | Result |
| --- | --- | --- |
| Type check | `tsc --noEmit` | pass |
| Lint and format | `biome check` on every file changed by the review fixes | no errors; 2 warnings in older component code |
| Unit tests | `vitest run --project unit` | 123 files, 838 tests pass |
| Database tests (real PostgreSQL 18) | `pnpm run test:db` | 42 files, 200 tests pass (two consecutive clean runs) |
| Schema drift | `pnpm run db:drift` | no drift |
| Inventory up to date | `migration:inventory --check` | pass |
| Production build | `next build` (CI placeholders) | pass, no warnings |
| Media service | `tsc`, `vitest run` in `backend/media_service` | pass, 59 tests |
| Real archive | `import:convex --expected-database … --expected-issuer …` then `verify:import` | OK: 35 tables, 336 files, nothing quarantined |
| Running app on PostgreSQL, Convex unreachable | `next dev` with `DATA_BACKEND=postgres`, `NEXT_PUBLIC_CONVEX_URL` pointed at a closed port, the imported archive and Infisical dev secrets, checked in a browser signed in | Stream control and profile render signed in with no loading hang; saved variants sync through `/api/user-variants`; every API call 200, no server errors; wheel stats return `forcedCount` on the real data |

Earlier running-app checks (2026-10-16) found two bugs that tests missed:
route handlers could not read the Clerk session (the proxy now mounts
`clerkMiddleware()` for PostgreSQL), and `useDataMutation` returned a new
function after every call, which looped pages that list it in effect
dependencies.
