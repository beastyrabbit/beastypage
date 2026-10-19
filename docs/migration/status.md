# Convex → PostgreSQL migration status

BeastyPage migrated its application data layer from Convex to PostgreSQL with
Drizzle. The migration is complete. Production cutover happened on 2026-10-18
across releases v7.11.0 through v7.11.4. The Convex code was removed in
v8.0.0 by commits 7ceb1ca, 9c7641e, and f01f6e4. v8.1.0 is the latest tag.

The Convex project has been deleted, and the one-time importer tooling has
been removed. The PostgreSQL tables used as importer bookkeeping remain until
a separate contract migration removes them.

## Remaining decommission steps

- Rename the Clerk JWT template `convex`, used by
  `frontend/components/quick-share/*Client.tsx` and
  `frontend/server/auth/identity.ts`; this requires a Clerk dashboard change.

The import role was dropped with kub-homelab #579 and #580, both merged on
2026-10-19; its orphaned Secrets and the Infisical key
`BEASTYPAGE_DB_IMPORT_PASSWORD` were removed. The only remaining decommission
items are the Clerk JWT template rename and the importer bookkeeping tables.

See the historical records in [ADR 0001](adr-0001-postgresql.md), the
[cutover runbook](cutover.md), and the [data contract](data-contract.md).
