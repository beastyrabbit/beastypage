# Staging data procedure

Staging receives only a scrubbed PostgreSQL dump. The maintainer performs the
following procedure in an isolated place:

1. Create a temporary PostgreSQL database that is reachable only from the
   operator workstation. Import the raw Convex ZIP with `import:convex`,
   supplying `DATABASE_IMPORT_URL`, `--expected-database`, and
   `--expected-issuer`. Keep the raw archive and importer report outside the
   repository.
2. Set `STAGING_SCRUB_KEY` in the operator's environment. It is at least 32
   characters, is held by the maintainer, and is never written to the
   repository, a report, or staging. Supply the staging Clerk issuer and a
   file containing the staging password to `scrub:staging`.
3. Run `scrub:staging` against that database with
   `--i-know-this-is-staging --expected-database <temporary-db>`, then run it
   again with `--verify` and the same target checks. The scrubber runs in one
   transaction and writes a private, count-only report under `--report-dir`.
4. Create a custom-format PostgreSQL dump with `pg_dump` and restore only that
   scrubbed dump into `beastypage-staging` using the staging owner URL. Run
   `db:migrate --status` and `scrub:staging --verify` against the restored
   database before the smoke rehearsal. Do not copy the raw database, raw
   archive, importer quarantine, or importer report into the staging namespace.
5. Delete the temporary database, raw archive, raw report, and any other raw
   copies after the scrubbed dump has been checked. Keep only the scrubbed
   dump for the restore rehearsal and delete it when staging is torn down.

The executable shape is therefore:

```bash
export DATABASE_IMPORT_URL='<temporary import URL from the local operator environment>'
pnpm run import:convex --archive /private/raw/snapshot_<ns>.zip \
  --report-dir /private/raw/import-report \
  --expected-database beastypage_temp \
  --expected-issuer https://<clerk-development-issuer> --replace
pnpm run scrub:staging --staging-issuer https://<clerk-development-issuer> \
  --staging-password-file /private/staging/password \
  --report-dir /private/staging/scrub-report \
  --i-know-this-is-staging --expected-database beastypage_temp
pg_dump --format=custom --file=/private/staging/scrubbed.dump "$DATABASE_IMPORT_URL"
export DATABASE_IMPORT_URL='<staging import URL from the staging secret>'
pnpm run scrub:staging --verify --staging-issuer https://<clerk-development-issuer> \
  --staging-password-file /private/staging/password \
  --report-dir /private/staging/verify-report \
  --i-know-this-is-staging --expected-database beastypage
```

Restore `/private/staging/scrubbed.dump` as the staging owner with
`pg_restore --clean --if-exists --no-owner`; the owner and import role grants
from `deploy/postgres/staging/` are required before the restore. The staging
CNPG import role is login-enabled because this is an isolated rehearsal; it is
never a production credential.

The scrubber regenerates capability tokens and keys, pseudonymizes Clerk and
Discord identifiers and username values with the key, re-hashes IP and rate
identities, clears IP addresses, and replaces ancestry password hashes with a
hash of the staging password. Quick Share keeps the metadata required by
tests (slug, source, names, MIME and size fields, state, expiry/retention and
timestamps); storage keys are replaced with synthetic `staging/<id>` keys,
failure diagnostics and multipart state are removed, and parts are deleted.
Discord challenges, expired transient capabilities, live events, jobs, and
job runs are removed.

Staging must never contain production Clerk or Discord identifiers, API keys,
edit/share/viewer/receipt tokens, password hashes other than the known staging
password hash, raw IP addresses, production storage keys, importer
quarantine, or a production secret. Staging uses its own Clerk development
instance, Quick Share bucket, and secrets.
