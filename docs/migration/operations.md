# PostgreSQL operations

How to run, migrate, back up and restore the BeastyPage database. The
decisions behind this page are in [ADR 0001](adr-0001-postgresql.md).
The PostgreSQL cutover completed on 2026-10-18.

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
  `DATABASE_URL` is unset. The Next.js server does not read this file when
  `DATABASE_URL` is unset.
- To pin the port, set `DATABASE_LOCAL_PORT` before the first `up`.
- `test:db` creates `beastypage_test_<random>` next to your database,
  migrates it with the production runner and drops it afterwards. Your own
  data is never touched.

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
`arc-beastypage` with a `postgres:18.6-alpine` service container. It runs
`db:drift`, applies `db:migrate` twice so the second run must be a no-op, runs
`db:migrate --status`, and runs `test:db`. The database password is a
throwaway value for an ephemeral container.

## How the migration runner fails safely

`scripts/db/migrate.ts`, bundled into the image as `scripts/db/migrate.mjs`:

- Holds `pg_advisory_lock(0x42504d47)` for the whole run. Init containers
  from parallel pods queue instead of racing.
- Refuses to run when the database records a newer schema than the image
  ships. It never downgrades.
- Verifies afterwards that the number of applied migrations equals the
  build's `SCHEMA_VERSION`, and records `version`, `compatible_from` and
  `app_version` in `beastypage_schema_version`.
- The database health route reads the same schema-version row using
  `server/db/schema-version.ts`. `/api/health/database` returns 503 when
  `DATABASE_URL` is missing, the database is unreachable, or the schema is
  incompatible. It returns 200 only when `checkCompatibility` succeeds for
  the application schema and its `compatible_from` floor.
- After migrations, the same owner-held run applies idempotent grants. It
  grants `beastypage_app` schema/table/sequence DML and default privileges.
  The role name is configurable with
  `DATABASE_APP_ROLE` and a missing local role is logged and skipped.
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

The one-time staging scrub procedure was completed before the migration and is
kept in the historical cutover record.

Staging has one CNPG instance. Its cold volume-snapshot procedure therefore
fences the only instance for the duration of a snapshot; use it for the timed
restore drill only and schedule the interruption during the rehearsal window.
Once the restored staging cluster is `Ready`, run the revoke-and-drop block
from production restore step 3 below, using `-n beastypage-staging` in both
`kubectl` calls and `cnpg.io/cluster=beastypage-staging-postgres` in the primary
pod selector; it must succeed before continuing the drill.

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
  - `beastypage_import` was dropped; the migration runner's legacy privilege
    revoke step is a no-op when the role is absent.
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
| Backup method | CNPG `ScheduledBackup`, `method: volumeSnapshot`, class `longhorn-cnpg-backup`, cold (`online: false`), target `prefer-standby` (copied to Garage) |
| Frequency | Every 6 hours, plus a manual backup before every contract migration or other planned schema-risk operation |
| Retention | 7 days of scheduled backups maintained by the homelab backup-prune job; manual backups are kept until deleted by hand |
| RPO | ≤ 6 hours (no WAL archiving, so no point-in-time recovery) |
| RTO | ≤ 1 hour, including image bytes in `files` |
| What one restore covers | Everything in PostgreSQL, image bytes included. Quick Share object bytes are in S3 and have their own retention; operators reconcile restored metadata against S3 as part of the Quick Share restore procedure. |

Manual backup (for example before a contract migration):

```bash
# A cold snapshot fences the chosen standby. With synchronous `ANY 1` and
# `dataDurability: required`, both standbys must be healthy first; otherwise a
# cold backup can pause primary commits while the snapshot runs.
kubectl -n webpage cnpg status beastypage-postgres
BACKUP_NAME="beastypage-postgres-pre-migration-$(date -u +%Y%m%dT%H%MZ)"
kubectl -n webpage cnpg backup beastypage-postgres --method volumeSnapshot \
  --online=false --backup-target prefer-standby \
  --backup-name "$BACKUP_NAME"
kubectl -n webpage wait --for=condition=Completed \
  "backup/$BACKUP_NAME" --timeout=30m
```

If either standby is already down, defer the manual cold backup until it is
healthy or accept the documented write pause as an incident decision. A
scheduled cold backup has the same fencing risk in a degraded three-instance
cluster; suspend the `ScheduledBackup` while degraded and resume it after both
standbys are healthy. See [CNPG data durability and synchronous replication](https://cloudnative-pg.io/docs/1.30/replication/#data-durability-and-synchronous-replication).

Restore. CloudNativePG recovery bootstraps a new `Cluster`; it does not
recover in place. The [CNPG 1.30 recovery documentation](https://cloudnative-pg.io/docs/1.30/recovery/#recovery-from-a-backup-object)
supports `bootstrap.recovery.backup.name` for an existing Backup; the
[volume-snapshot backup documentation](https://cloudnative-pg.io/docs/1.30/appendixes/backup_volumesnapshot/#hot-and-cold-backups)
recommends cold snapshots for snapshot recovery. See also the [CNPG
certificate documentation](https://cloudnative-pg.io/documentation/current/certificates/).
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
HelmRelease patch. The replacement is the complete production `Cluster`
document from `deploy/postgres/production/cnpg-cluster.yaml`, including
`managed.roles`, backup settings, PostgreSQL parameters, affinity, storage and
resources. Change only its `spec.bootstrap` block to:

```yaml
  bootstrap:
    recovery:
      backup:
        name: <named Backup from `kubectl -n webpage get backup`>
```

Keep the `ScheduledBackup` document declared in that manifest unchanged.
Before deleting the damaged Cluster, confirm that the chosen Backup and its
VolumeSnapshot have no owner reference that deletion would cascade (the
`backupOwnerReference: self` -> Backup -> `snapshotOwnerReference: backup`
chain would otherwise remove them). Preserve either object through the
platform's reviewed orphaning procedure before proceeding.

Restore is two reviewed Flux phases because CNPG evaluates `bootstrap` only
when a Cluster is created, and one Flux change cannot delete and recreate the
same Cluster name. Keep the frontend in maintenance throughout.

1. **Phase 1: remove only the Cluster.** Submit a reviewed kub-homelab Flux
   change that removes the `beastypage-postgres` `Cluster` from the desired
   state. Leave `ScheduledBackup` and every `Backup` declaration untouched.
   The production template keeps `Cluster` and `ScheduledBackup` as separate
   YAML documents, so removing the former does not prune the latter. Reconcile
   Flux, then confirm the Cluster and its PVCs are gone and the chosen Backup
   and its VolumeSnapshot still exist. Preserve either object through the
   platform's reviewed orphaning procedure if owner references would cascade.
2. **Phase 2: add the recovery Cluster.** Submit the complete production
   `Cluster` manifest with `bootstrap.recovery.backup.name` set to the chosen
   Backup, reconcile Flux, and wait for `beastypage-postgres` to be `Ready`.
   Confirm the generated `beastypage-postgres-ca` secret contains `ca.crt`.
3. **Revoke restored grants and drop the retired import role.** After any
   restore, run the following block as the `postgres` superuser through the
   primary pod. It is a no-op when the role is absent and must succeed before
   continuing. The CloudNativePG manifest no longer manages this retired role,
   and the migration runner only revokes its privileges.

   ```bash
   kubectl -n webpage exec "$(kubectl -n webpage get pod \
     -l cnpg.io/cluster=beastypage-postgres,cnpg.io/instanceRole=primary \
     -o jsonpath='{.items[0].metadata.name}')" -c postgres -- \
     psql -U postgres -d beastypage -c "do \$\$ begin if exists (select 1 from pg_roles where rolname = 'beastypage_import') then execute 'drop owned by beastypage_import'; execute 'drop role beastypage_import'; end if; end \$\$;"
   ```

4. Run `pnpm --dir frontend run db:migrate --status` against the unchanged
   `beastypage-postgres-rw.webpage.svc` service, then run the verification
   queries in the restore runbook: row counts, file hashes and relationships.
5. Restart the frontend so its `/etc/postgres-ca/ca.crt` projected volume and
   TLS connection use the replacement cluster. Do not edit the Infisical URL
   targets: they already point at the original service and are Flux-owned.
6. Record the measured restore time against the 1-hour RTO and lift
   maintenance. Leave the `bootstrap.recovery` stanza in the committed
   Cluster manifest: CNPG only uses `bootstrap` when it creates a cluster,
   and if the cluster is ever recreated from Git, a recovery stanza fails
   loudly on a missing backup where `initdb` would silently start an empty
   database.

Restore test status:

- [ ] Staging restore rehearsed and timed (#108 / #116 gate)
- [ ] Production restore drill

If the measured restore misses the RTO, or a 6-hour RPO is not acceptable,
add the CNPG Barman Cloud plugin with WAL archiving to Garage for
point-in-time recovery. That is a homelab-wide decision.
