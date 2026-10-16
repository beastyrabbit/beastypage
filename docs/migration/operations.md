# PostgreSQL operations

How to run, migrate, back up and restore the BeastyPage database. The
decisions behind this page are in [ADR 0001](adr-0001-postgresql.md).
Convex stays production until the approved cutover (#116).

## Local development (one database per worktree)

```bash
pnpm --dir frontend run db:local up        # start (or create) this worktree's PostgreSQL
pnpm --dir frontend run db:migrate         # apply migrations
pnpm --dir frontend run db:migrate --status
pnpm --dir frontend run test:db            # database tests in a throwaway database
pnpm --dir frontend run db:local psql      # interactive psql
pnpm --dir frontend run db:local down      # stop, keep data
pnpm --dir frontend run db:local destroy --yes   # delete container and volume
```

- Each worktree gets container and volume `beastypage-pg-<hash>`. The hash is
  derived from the worktree path. The container listens on a loopback port
  near `54000 + hash`, and the password is random.
- The settings go to `frontend/.env.database.local`: mode 0600, gitignored,
  never committed. Database scripts and tests read it whenever
  `DATABASE_URL` is unset. The Next.js server never falls back to it.
- To pin the port, set `DATABASE_LOCAL_PORT` before the first `up`.
- `test:db` creates `beastypage_test_<random>` next to your database,
  migrates it with the production runner and drops it afterwards. Your own
  data is never touched.

Worktree shortcut: `pnpm` in a fresh worktree re-runs the `prepare` script
(`convex codegen`), which fails without Convex credentials. Call the binaries
directly, for example `./node_modules/.bin/tsx scripts/db/migrate.ts` inside
`frontend/`.

## Schema changes

1. Edit `frontend/server/db/schema/*.ts`. The JSON column shapes live in
   `frontend/server/db/contracts.ts`.
2. Run `pnpm --dir frontend run db:generate`, then read the generated SQL in
   `frontend/drizzle/`.
3. Expand first. A migration may add tables, columns and indexes, and may
   relax constraints. It may not drop or rename anything the previous
   release reads.
4. Contract later, in a separate release after every old replica is gone.
   Add `"<migration number>": <oldest compatible app schema>` to
   `frontend/drizzle/compat.json` in the same commit.
5. `pnpm --dir frontend run db:drift` must report no drift. CI enforces it.

## CI

The `database` job in `.github/workflows/validate.yml` runs on
`arc-beastypage` with a `postgres:18.6-alpine` service container. It checks
that the Convex inventory is current and that there is no schema drift,
applies the migrations twice (the second run must be a no-op), checks schema
compatibility, and runs `test:db`. No secrets are involved. The database
password is a throwaway value for an ephemeral container.

## How the migration runner fails safely

`scripts/db/migrate.ts`, bundled into the image as `scripts/db/migrate.mjs`:

- Holds `pg_advisory_lock(0x42504d47)` for the whole run. Init containers
  from parallel pods queue instead of racing.
- Refuses to run when the database records a newer schema than the image
  ships. It never downgrades.
- Verifies afterwards that the number of applied migrations equals the
  build's `SCHEMA_VERSION`, and records `version`, `compatible_from` and
  `app_version` in `beastypage_schema_version`.
- The application checks the same row at startup
  (`server/db/schema-version.ts`). The readiness probe
  `/api/health/database` is gated on `DATA_BACKEND=postgres`; it returns a
  clear 503 without opening a pool while Convex is selected. Once PostgreSQL
  is selected it fails, and pods stay out of rotation, when
  `db.version < SCHEMA_VERSION` or `SCHEMA_VERSION < db.compatible_from`.
- After migrations, the same owner-held run applies idempotent grants. It
  grants `beastypage_app` schema/table/sequence DML, default privileges and
  the documented 5s/2s/10s role timeouts. The role name is configurable with
  `DATABASE_APP_ROLE` and a missing local role is logged and skipped. When
  present, `beastypage_import` receives the same DML and `TRUNCATE` plus
  sequence privileges so `import:convex --replace` can empty its tables.
  Verify as the app role with `\dp public.*`, `\ddp`, `\du+ beastypage_app`,
  `show statement_timeout`, and a harmless insert/update/delete using a
  sequence. The migration runner repeats these statements safely on every
  non-status run.

## Staging

| | |
| --- | --- |
| Where | Homelab namespace `beastypage-staging`, CNPG cluster `beastypage-staging-postgres` (1 instance, no synchronous replica) |
| Data | Only the scrubbed archive from #112. Never the raw production export. |
| Secrets | Infisical `staging` environment, path `/kubernetes/beastypage-staging/*`. No production values. |
| Isolation | Clerk development instance. No Discord bot token. Its own Quick Share bucket. Egress to production hosts blocked by NetworkPolicy. |
| Owner | The maintainer, who also deletes the scrubbed archive copies when staging is torn down. |

Follow the exact [staging scrub procedure](staging.md) before restoring any
archive into this namespace.

Templates: `deploy/postgres/staging/`. Production templates are in
`deploy/postgres/production/`. Both go into kub-homelab through a reviewed
pull request. **Applying them is an infrastructure change that needs
explicit approval.** Nothing in this repository applies them.

## Homelab production

- Cluster `beastypage-postgres` in namespace `webpage`: 3 instances,
  synchronous replication (`any 1`, `dataDurability: required`), Longhorn
  `longhorn-single-replica` volumes with required pod anti-affinity.
- Roles:
  - `beastypage_owner`: bootstrap owner, used for migrations.
  - `beastypage_app`: DML only, connection limit 30.
  - `beastypage_import`: `login: false` except during a rehearsal or the
    cutover.
- The migration runner applies these grants as the owner after every schema
  migration (the SQL is shown here for operator verification):

  ```sql
  grant usage on schema public to beastypage_app;
  grant select, insert, update, delete on all tables in schema public to beastypage_app;
  grant usage, select on all sequences in schema public to beastypage_app;
  alter default privileges for role beastypage_owner in schema public
    grant select, insert, update, delete on tables to beastypage_app;
  alter default privileges for role beastypage_owner in schema public
    grant usage, select on sequences to beastypage_app;
  alter role beastypage_app set statement_timeout = '5s';
  alter role beastypage_app set lock_timeout = '2s';
  alter role beastypage_app set idle_in_transaction_session_timeout = '10s';
  ```

  The import role needs the additional truncate privilege while its login is
  enabled for a rehearsal or cutover:

  ```sql
  grant usage on schema public to beastypage_import;
  grant select, insert, update, delete, truncate on all tables in schema public to beastypage_import;
  grant usage, select on all sequences in schema public to beastypage_import;
  ```

  PostgreSQL permits `TRUNCATE` only to a table owner or a role with that
  explicit table privilege; the importer role is therefore never assumed to
  inherit it from DML grants.

- `beastypage_import` is `login: false` in the CNPG template. For a rehearsal
  or the cutover window, submit the normal kub-homelab Flux change that sets
  its managed role to `login: true`, wait for the secret sync, and inject the
  generated `DATABASE_IMPORT_URL` into the operator environment. After the
  import and verification, submit the corresponding Flux change back to
  `login: false` and wait for reconciliation. Do not toggle the role with a
  direct `kubectl` command; kub-homelab owns that state.

- TLS: CNPG issues the server certificate. Clients use
  `sslmode=verify-full&sslrootcert=/etc/postgres-ca/ca.crt`, with the
  certificate mounted from the `beastypage-postgres-ca` secret. In
  production the database client refuses non-TLS URLs to non-loopback hosts.
- Credentials: Infisical `prod` at `/kubernetes/webpage/beastypage-postgres`.
  Rotate by writing a new password in Infisical; the operator syncs it within
  5 minutes, CNPG updates the managed role, and Reloader restarts the
  frontend.

## Backup, restore, RPO and RTO

| Item | Target / setting |
| --- | --- |
| Backup method | CNPG `ScheduledBackup`, `method: volumeSnapshot`, class `longhorn-cnpg-backup` (copied to Garage) |
| Frequency | Every 6 hours, plus a manual backup before every contract migration and before the cutover |
| Retention | 7 days of scheduled backups (homelab `cnpg-backup-prune`); manual backups are kept until deleted by hand |
| RPO | ≤ 6 hours (no WAL archiving, so no point-in-time recovery) |
| RTO | ≤ 1 hour, including image bytes in `files` |
| What one restore covers | Everything in PostgreSQL, image bytes included. Quick Share object bytes are in S3 and have their own retention; the restored metadata is reconciled against S3 with `quick-share:reconcile` (#110/#111). |

Manual backup (for example before cutover):

```bash
kubectl -n webpage cnpg backup beastypage-postgres --method volumeSnapshot \
  --backup-name beastypage-postgres-pre-cutover-$(date -u +%Y%m%dT%H%MZ)
kubectl -n webpage get backup -w
```

Restore. This creates a **new** cluster from a snapshot backup; the
original cluster is left untouched until you switch to the new one.

```yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: beastypage-postgres-restore
  namespace: webpage
spec:
  instances: 3
  imageName: ghcr.io/cloudnative-pg/postgresql:18.6
  storage: { size: 20Gi, storageClass: longhorn-single-replica }
  bootstrap:
    recovery:
      backup:
        name: <backup name from `kubectl -n webpage get backup`>
```

Then:

1. Wait for `Ready`.
2. Run `db:migrate --status` against the new cluster.
3. Run the verification queries in the cutover runbook: row counts, file
   hashes, relationships.
4. Point `beastypage-postgres-urls` at `beastypage-postgres-restore-rw` and
   restart the frontend.
5. Record the measured restore time against the 1-hour RTO.

Restore test status:

- [ ] Staging restore rehearsed and timed (#108 / #116 gate)
- [ ] Production restore drill after cutover

If the measured restore misses the RTO, or a 6-hour RPO is not acceptable,
add the CNPG Barman Cloud plugin with WAL archiving to Garage for
point-in-time recovery. That is a homelab-wide decision.
