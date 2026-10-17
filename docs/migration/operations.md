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
  grants `beastypage_app` schema/table/sequence DML and default privileges.
  The role name is configurable with
  `DATABASE_APP_ROLE` and a missing local role is logged and skipped. When
  present, `beastypage_import` receives the same DML and `TRUNCATE` plus
  sequence privileges so `import:convex --replace` can empty its tables.
  `server/db/pool.ts` and the live-event listener set `statement_timeout`,
  `lock_timeout` and `idle_in_transaction_session_timeout` on each
  application connection. Role-level settings are optional; only a superuser
  or CNPG-managed role with the required admin authority can apply them. The
  migration runner deliberately does not alter another role. Verify grants as
  the app role with `\dp public.*`, `\ddp`, and a harmless
  insert/update/delete using a sequence. Verify the three timeout values
  through a connection created by the application pool. The migration runner
  repeats the grant statements safely on every non-status run.

## Staging

| | |
| --- | --- |
| Where | Homelab namespace `beastypage-staging`, CNPG cluster `beastypage-staging-postgres` (1 instance, no synchronous replica) |
| Data | Only the scrubbed archive from #112. Never the raw production export. |
| Secrets | Infisical `staging` environment, path `/kubernetes/beastypage-staging/postgres`. No production values. |
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
  ```

- The three timeout values are session settings supplied by
  `server/db/pool.ts` for each application connection. An operator may set the
  same values at role level only when a superuser or a CNPG-managed role has
  the necessary authority; that optional setting is outside the owner-run
  grant step.

- The import role needs the additional truncate privilege while its login is
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
  certificate mounted from the `beastypage-postgres-ca` secret. CNPG's
  generated CA secret contains both `ca.crt` and the signing key `ca.key`;
  app-template consumers select only `ca.crt`. In production the database
  client refuses non-TLS URLs to non-loopback hosts.
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

Restore. CloudNativePG recovery bootstraps a new `Cluster`; it does not
recover in place. See the [CNPG recovery documentation](https://cloudnative-pg.io/documentation/current/recovery/),
the [recovery-from-a-Backup example](https://cloudnative-pg.io/docs/devel/recovery#recovery-from-a-backup-object),
and the [CNPG certificate documentation](https://cloudnative-pg.io/documentation/current/certificates/).
For this service, restore **under the original cluster name** after the
damaged resource is removed. That keeps the Flux-owned service
`beastypage-postgres-rw`, Infisical URLs and `beastypage-postgres-ca` mount
stable. The replacement cluster gets a new generated CA under that same
secret name, so restart the frontend after the replacement is Ready to pick
up its `ca.crt`. This costs the old cluster and requires a reviewed Flux
delete/recreate change, but avoids a temporary host/CA switch that Infisical
would overwrite every five minutes and avoids a TLS `verify-full` mismatch.

The CNPG certificate secret contains `ca.crt` and the private signing key
`ca.key`; consumers select only `ca.crt` as shown in the production
HelmRelease patch. Protect the completed Backup object and its snapshot before
deleting the old Cluster. On-demand Backup resources normally have no cluster
owner reference; if this one does, preserve the snapshot and Backup object
through the platform's reviewed orphaning procedure before proceeding.

```yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: beastypage-postgres
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

Submit this manifest as the emergency kub-homelab Flux change, together with
the deletion of the damaged `beastypage-postgres` Cluster; do not apply it
with `kubectl` while the normal Flux manifest still declares the old
`bootstrap.initdb`. Keep the frontend in maintenance and leave Convex paused
throughout. Then:

1. Confirm the old Cluster is gone and the named Backup object and snapshot
   still exist; record the deletion and recreation timestamps.
2. Wait for `beastypage-postgres` to be `Ready` and for the generated
   `beastypage-postgres-ca` secret to contain `ca.crt`.
3. Run `db:migrate --status` against the unchanged
   `beastypage-postgres-rw.webpage.svc` service, then run the verification
   queries in the cutover runbook: row counts, file hashes and relationships.
4. Restart the frontend so its `/etc/postgres-ca/ca.crt` projected volume and
   TLS connection use the replacement cluster. Do not edit the Infisical URL
   targets: they already point at the original service and are Flux-owned.
5. Record the measured restore time against the 1-hour RTO, commit the normal
   production Cluster template back through kub-homelab Flux, and wait for
   reconciliation before lifting maintenance.

Restore test status:

- [ ] Staging restore rehearsed and timed (#108 / #116 gate)
- [ ] Production restore drill after cutover

If the measured restore misses the RTO, or a 6-hour RPO is not acceptable,
add the CNPG Barman Cloud plugin with WAL archiving to Garage for
point-in-time recovery. That is a homelab-wide decision.
