# Catalog PostgreSQL slice

The catalog slice runs through the Next.js API routes, catalog services, and
Drizzle repositories. Browser clients call these routes through the data hooks.

| Feature or operation | Current implementation |
| --- | --- |
| List seasons and ensure defaults | `GET` and `POST /api/seasons`; `listSeasons` and `ensureDefaultSeasons` in `frontend/server/services/catalog.ts` |
| List rarities and ensure defaults | `GET` and `POST /api/rarities`; `listRarities` and `ensureDefaultRarities` in `frontend/server/services/catalog.ts` |
| Public Catdex page and record lookup | `GET /api/catdex` and `GET /api/catdex/[id]`; `listCatdex` and `getCatdexByLink` |
| Pending count, owner list, and moderation list | `GET /api/catdex/pending`, `GET /api/catdex/owner`, and `GET /api/catdex/moderation`; `hasPendingCatdex`, `listCatdexForOwner`, and `listCatdexForModeration` |
| Create and edit Catdex records | `POST /api/catdex` and `PATCH /api/catdex/[id]`; `createCatdex` and `editCatdex` |
| Catdex card upload | `POST /api/catdex/upload-url` issues a reservation, and `POST` or `OPTIONS /api/catdex/upload` stores the bytes with `storeAndAttachCatdexUpload` |
| Approve a Catdex record | `POST /api/catdex/[id]/approve` and `approveCatdex` |
| Collection list and focus | `GET` and `PATCH /api/collection`, plus `POST` or `PATCH /api/collection/[id]/focus`; `listCollection` and `setCollectionFocus` |
| Stored files | `storeUploadedFile` writes `files` rows and `GET /api/files/[id]` serves them |

Public Catdex reads are approval-filtered and use keyset cursors. The page size
is capped at 48. Collection and Catdex legacy list responses remain available
when callers use the `limit` query parameter.

Card uploads accept PNG and JPEG files up to 10 MiB. The upload service records
decoded MIME type and dimensions. Upload admission and default season and
rarity setup use transaction-scoped advisory locks. Thumbnail work is queued as
`catdex.thumbnail`; `catdex.thumbnail-backfill` runs every six hours with a
bounded batch, and `catdex.upload-retention` runs hourly. The thumbnail handler
reads source bytes in a short transaction, processes them outside that
transaction, and checks the attempt again before storing the result.

The daily `files.orphan-cleanup` job checks the schema-derived foreign-key set
before deleting rows past the retention grace period.
