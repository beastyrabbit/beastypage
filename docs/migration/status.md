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
- Remove `CONVEX_DEPLOY_KEY` and `CONVEX_DEPLOYMENT` from Infisical prod and
  `/ci` if they still exist. This is outside the repository.
- Deploy this release first so the frontend init container revokes the retired
  role's privileges. Then merge the kub-homelab change in PR #579 (phase one:
  `ensure: absent`). After it reconciles, delete the role entry, the orphaned
  `beastypage-postgres-import-role` and `beastypage-postgres-import-url`
  Secrets in namespace `webpage`, and the
  `BEASTYPAGE_DB_IMPORT_PASSWORD` key in Infisical.

See the historical records in [ADR 0001](adr-0001-postgresql.md), the
[cutover runbook](cutover.md), and the [data contract](data-contract.md).
