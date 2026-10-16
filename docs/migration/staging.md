# Staging data procedure

Staging receives only a scrubbed PostgreSQL archive. The maintainer performs
the following procedure in an isolated place:

1. Create a temporary PostgreSQL database that is reachable only from the
   operator workstation. Import the archive with `import:convex`, keeping the
   raw archive and importer report outside the repository.
2. Set `STAGING_SCRUB_KEY` in the operator's environment. It is at least 32
   characters, is held by the maintainer, and is never written to the
   repository, a report, or staging. Supply the staging Clerk issuer and a
   file containing the staging password to `scrub:staging`.
3. Run `scrub:staging` against that database, then run it again with
   `--verify`. The scrubber runs in one transaction and writes a private,
   count-only report under `--report-dir`.
4. Dump the scrubbed database to a new archive and restore only that archive
   into `beastypage-staging`. Do not copy the raw database, raw archive, or
   importer quarantine into the staging namespace.
5. Delete the temporary database, raw archive, raw report, and any other raw
   copies after the scrubbed dump has been checked. Keep only the scrubbed
   dump for the restore rehearsal and delete it when staging is torn down.

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
