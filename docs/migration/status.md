# Convex → PostgreSQL migration status

The migration is forward-only (ADR 0001 §1). **Production still runs on
Convex.** Nothing here has been deployed. No production export, secret
change, homelab change, release tag or cutover has happened.

Status as of 2026-10-15, branch `t3code/65208027`.

| Phase | Issue | State | Evidence in the repository | Still open |
| --- | --- | --- | --- | --- |
| 1. Inventory and architecture | #105 | **Done** | `frontend/scripts/migration/convex-inventory.ts` (`--check` in CI), [`convex-inventory.md`](convex-inventory.md), [ADR 0001](adr-0001-postgresql.md) | Machine-linked blockers between the issues |
| Production measurement and export | #106 | Not started | Runbook steps in [`importer.md`](importer.md) | Needs the maintainer: dashboard sizes, one export, SHA-256, cost |
| 2. PostgreSQL foundation | #108 | **Repository side done** | Drizzle, `db:local`, the CI `database` job, the migration runner with lock, version and fail-closed check, the bundled init-container runner, [`operations.md`](operations.md), `deploy/postgres/*` templates | kub-homelab CNPG cluster, Infisical paths, restore drill (need approval); volume size from #106 |
| 3. Target schema and contracts | #107, #109 | **Done against code-derived fixtures** | `server/db/schema/*`, `server/db/contracts.ts`, `drizzle/0000_init.sql`, [`data-contract.md`](data-contract.md), legacy-link lookups and tests | Validation report on the real #106 archive |
| Image storage | #110 | **Partial** | `files` table, content-addressed import, `/api/files/[id]` (ETag, 304, immutable, referenced-only), Quick Share S3 verifier | The `bytea` gate on real sizes; new uploads writing `files`; orphan cleanup job |
| 4. Importer | #111 | **Done against the synthetic archive** | `scripts/migration/import*`, real-PostgreSQL tests (rerun fingerprints, crash plus resume, quarantine, offline guard), [`importer.md`](importer.md) | Format confirmation and a run on the #106 archive |
| Staging data | #112 | Not started | Scrub policy in `data-contract.md`, staging template | Scrubber, staging namespace (approval) |
| 5. Server data layer | #113 | **Started**: settings slice | `server/{errors,http,backend}.ts`, `server/auth/identity.ts`, `server/db/transaction.ts`, `server/services/settings.ts` behind `DATA_BACKEND`, Convex-vs-PostgreSQL parity tests, route tests | Catdex, collection, seasons, rarities, adoption, evolution, ancestry, perfect cats, coinflip, wheel, users and variants, cat shares and previews, Discord, Quick Share, Catdex uploads; client hooks (TanStack Query) |
| 6. Live updates | #114 | Designed (ADR §10); `live_events` and `revision` columns exist | — | SSE route, LISTEN fan-out, three-replica test |
| 7. Jobs and HTTP routes | #115 | Designed (ADR §11); `jobs` and `job_runs` tables exist | — | Worker, five recurring jobs, five routes, media `CONTROL_PLANE_URL` |
| 8. Cutover | #116 | Outline only (ADR §13) | — | Runbook, staging rehearsal, approval |
| 9. Decommission | #117 | Not started | — | Only after cutover evidence exists |

## Validation run for this state

All commands run from `frontend/`. Timings are from the local run on
2026-10-15.

| Check | Command | Result |
| --- | --- | --- |
| Type check | `tsc --noEmit` | pass |
| Lint | `biome lint .` | no errors; 77 warnings, all older than this work |
| Unit tests | `vitest run --project unit` | 104 files, 796 tests pass |
| Database tests (real PostgreSQL 18.6) | `pnpm run test:db` | pass: runner, constraints, legacy links, importer, settings parity, settings and file routes |
| Schema drift | `pnpm run db:drift` | no drift |
| Migrations twice, then status | `db:migrate` ×2, `db:migrate --status` | pass |
| Bundled runner in an image-like layout | `db:bundle`, then `node scripts/db/migrate.mjs` with `NODE_ENV=production` | pass |
| Importer CLI end to end | `import:fixture`, then `import:convex` | report OK; private file modes |
| Inventory up to date | `migration:inventory --check` | pass |
| Production build | `next build` (CI placeholders) | pass; `/api/files/[id]` and `/api/health/database` built as dynamic routes |
| Settings slice in a running app | `next dev` with `DATA_BACKEND=postgres` and Infisical dev secrets | `/api/health/database` returns ok. Dash settings create, read and edit all work; an edit with the wrong token returns 403. `/dash?slug=` renders the stored config from PostgreSQL. In a browser, `/single-cat-plus?variant=` applies the stored preset ("Settings loaded from URL", Calm mode), and an unknown variant shows "No preset found". Screenshots are in `.playwright-mcp/pg-*.png` (gitignored). |
