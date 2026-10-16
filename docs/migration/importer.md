# Convex export importer

The importer (#111) reads a Convex export ZIP and writes it into PostgreSQL.
It never contacts Convex: the archive is its only input, and `fetch` is
disabled for the whole run. The same command fills a local worktree
database, staging (#112) and production at cutover (#116).

## Handling the data safely

- Production archives hold raw IPs, IP hashes, Clerk and Discord IDs, API
  keys, edit tokens, upload tokens and password hashes.
- Keep the archive and the report directory in encrypted, access-controlled
  storage outside the repository. The importer refuses any archive or report
  path inside the repository.
- The report directory is created with mode 0700 and every file in it with
  mode 0600. Quarantined documents are written in full so they can be
  reviewed, so the quarantine files are as sensitive as the archive.
- Never attach an archive, a report or a quarantine file to an issue, a CI
  artifact or a chat message. Issue comments may quote counts, never content.

## Running it

```bash
cd frontend
pnpm run db:local up && pnpm run db:migrate          # or point DATABASE_IMPORT_URL at the target

# Synthetic archive (no real data) for local rehearsal
pnpm run import:fixture /tmp/fixture/snapshot_1760529600000000000.zip

pnpm run import:convex \
  --archive /private/convex/snapshot_<deployment>_<ns>.zip \
  --report-dir /private/convex/import-<date> \
  --expected-database beastypage \
  --expected-issuer https://<clerk issuer> \
  [--freeze-at 2026-10-15T18:00:00Z] [--replace]
```

| Option | Meaning |
| --- | --- |
| `--archive` | Path to the Convex export ZIP. The archive is streamed one entry at a time. |
| `--report-dir` | Private output: `report.md`, `report.json` and `quarantine/<step>.jsonl`. |
| `--expected-database` | Required target identity check. The importer prints the target host and verifies `current_database()` before any write. |
| `--freeze-at` | The write-freeze time. Defaults to the timestamp in `snapshot_[<deployment>_]<ns>.zip`. Short-lived rows that expired before it are skipped. |
| `--expected-issuer` | Required issuer check. Every `tokenIdentifier` and owner column must start with `<issuer>\|`; anything else is quarantined. |
| `--allow-any-issuer` | Explicit local/loopback test mode only. The report records `issuer.mode: any`; it is rejected for remote targets. |
| `--replace` | Empty every imported table before importing. Needed when the database already holds a different archive or rows created by the app (staging refills). |
| `--confirm-remote-replace` | Required in addition to `--replace` for a non-loopback target. |

The database connection comes from `DATABASE_IMPORT_URL`. A `DATABASE_URL`
fallback is accepted only when it points to a loopback database for local
synthetic fixtures. Remote imports fail closed without the dedicated URL. The
schema version and `current_database()` must be compatible with the supplied
`--expected-database` before the importer writes.

`verify:import` takes the same `--expected-database` and issuer arguments. It
fails if the import report's issuer mode or expected issuer differs from the
arguments supplied to verification. The report records whether issuer
validation used `expected` or explicit loopback-only `any` mode.

## What it does

1. Records a manifest: archive name, size, SHA-256, freeze time, table list,
   storage object count and contract version. The private path of the
   archive is never recorded.
2. Imports files. Only storage objects referenced by importable rows are
   imported. Each one is hashed, its size checked, its format decoded with
   sharp, and its MIME type compared with the Convex metadata. Only PNG,
   JPEG, WebP, GIF and AVIF are accepted.
   - Identical bytes are stored once (content-addressed IDs), and every
     storage ID is mapped in `import_storage_map`.
   - Unreferenced objects are counted, not imported.
3. Imports the tables in dependency order (`scripts/migration/import/tables.ts`).
   - Every document is checked for exactly the declared Convex fields, plus
     types, timestamps, enums and the JSON contracts in
     `server/db/contracts.ts`.
   - `adoption_batch` is written twice: once before `cat_profile`, and again
     as `adoption_batch_refs` once profiles exist, so the embedded
     `settings.starter.profileId` can be rewritten.
4. Writes rows in batches of 200 with `ON CONFLICT (id) DO UPDATE`. If a
   batch hits a constraint violation, it is retried row by row inside
   savepoints. Only the offending rows are quarantined, and the first holder
   of a unique value wins, in archive order.
5. Verifies that every table's row count equals the rows the run imported.
   It also computes a per-table content fingerprint
   (`md5(string_agg(row::text order by id))`).

## Outcomes per document

| Outcome | When | Effect |
| --- | --- | --- |
| imported | the document is valid | the row is written |
| skipped | a short-lived row expired at the freeze (`catdex_uploads`, `perfect_matchups`, `discord_challenge`, `quick_share_usage`); parts of finished uploads; consumed capabilities; unreferenced storage objects | counted by reason; nothing written |
| repaired | a dangling optional `v.id()` (set to NULL, as `ON DELETE SET NULL` would); a leased Quick Share job (returned to pending); live OBS state (reset to idle); duplicate file bytes (shared row); a dangling embedded ID (kept as the legacy ID, which the legacy lookups still resolve) | the row is written; counted by reason |
| quarantined | invalid JSON, an unexpected field, a wrong type, a contract failure, a dangling required reference, a missing or invalid file, a foreign issuer, a duplicate unique value | the row is not written; the full document goes to `quarantine/<step>.jsonl` |

Nothing is coerced silently. A quarantined record stays outside the
database until someone reviews it. The fix is then a cleanup rule or a
contract change, followed by a re-run.

## Reruns, resume and replace

- **Same archive.** Completed steps are skipped through
  `import_checkpoints`. An interrupted step re-runs with idempotent upserts,
  so the result is the same as a clean run. CI proves this: fingerprints are
  equal after a second run and after a crash plus resume.
- **Different archive.** The importer refuses unless `--replace` is given.
- **IDs.** IDs are `uuidv5("<table>:<convex _id>")`, and file IDs are
  `uuidv5("files:<sha256>")`. The same archive gives byte-identical tables
  on any empty database.

## Quick Share objects

`pnpm run import:verify-quick-share --report-dir <private dir>` sends a
signed `HEAD` request for every imported upload's S3 objects. It never
writes or deletes an object. Expected objects depend on the upload state:

| State | Expected objects |
| --- | --- |
| `uploading` | none checked |
| `processing`, `unsupported`, `failed` | original exists, size matches |
| `ready` | original exists and public derivative exists, size and type match |
| `removed` | none required; a leftover original is noted as a pending delete |

Run it with the media service's S3 settings from Infisical (`/media`).

## First real export (#106, 2026-10-16)

pnpm forwards a literal `--` to the script, which rejects it, so the
commands above pass their options directly.

The dashboard export confirmed the format:

- The archive is named `snapshot_<deployment>_<ns>.zip`.
- `_storage/documents.jsonl` has `_id`, `_creationTime`, `contentType`,
  `internalId`, `sha256` (base64) and `size`.
- Storage files are named `<storage id>.<extension>`.
- Each table folder holds `documents.jsonl` and `generated_schema.jsonl`.

The run imports cleanly and a second run gives identical fingerprints.
Cleanup rules adopted for what real data contained:

| Found | Rule |
| --- | --- |
| JPEG bytes labelled `image/png` | repaired: the decoded raster type is stored. A non-image declared type is still quarantined. |
| `perfect_cats.lastShownAt = 0` | repaired: Convex inserts `0` for "never shown"; it becomes `NULL`. |
| Rows whose required `userId` points at a deleted user (2 `user_variants`, 1 `cat_stream_sessions`, one user removed by hand on 2026-04-03) | quarantined and dropped: the maintainer decided on 2026-10-16 not to keep them. These 3 quarantined rows are expected at cutover. |

- [ ] Attach counts only (no content) to #107 and #111.
