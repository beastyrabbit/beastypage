# Catalog PostgreSQL slice

The catalog slice is selected with `DATA_BACKEND=postgres`; the Convex
implementation remains the default. Browser clients use the dual-path hooks in
`frontend/lib/data/catalog.ts`.

| Convex function or route | PostgreSQL replacement |
| --- | --- |
| `seasons.list`, `seasons.totalCount`, `seasons.getDoc` | `GET /api/seasons`, `listSeasons` / repository selectors |
| `seasons.ensureDefaults` | `POST /api/seasons`, `ensureDefaultSeasons` |
| `rarities.list`, `rarities.totalCount` | `GET /api/rarities`, `listRarities` / repository selectors |
| `rarities.ensureDefaults` | `POST /api/rarities`, `ensureDefaultRarities` |
| `catdex.page`, `catdex.list`, `catdex.get` | `GET /api/catdex` and `GET /api/catdex/[id]`; keyset cursors preserve the 48-card page cap and approved-only public reads |
| `catdex.hasPending`, `catdex.pendingCount` | `GET /api/catdex/pending` and the moderation service |
| Catdex owner/moderation views and edits | `GET /api/catdex/owner`, `GET /api/catdex/moderation`, `PATCH /api/catdex/[id]`, and `POST /api/catdex/[id]/approve` |
| `catdex.generateUploadUrl` | `POST /api/catdex/upload-url` |
| `catdexHttp.upload`, `catdexHttp.options` | `POST, OPTIONS /api/catdex/upload` |
| `catdex.create` | `POST /api/catdex`; reservations are consumed transactionally and `catdex.thumbnail` is deduped per cat |
| `imageService.generateForCat` and thumbnail mutations | `catdex.thumbnail` job and `catdex-thumbnail` service; JPEG thumbnails are resized to the existing 256px/quality-85 output |
| `catdex.enqueueMissingThumbnails` | Recurring `catdex.thumbnail-backfill` job (6 hours, limit 25) |
| `catdex.cleanupExpiredUploads` | Recurring `catdex.upload-retention` job (1 hour, limit 100) |
| `collection.page`, `collection.list` | `GET /api/collection` |
| `collection.setFocus` | `PATCH /api/collection` or `POST/PATCH /api/collection/[id]/focus`; uses `isAdminIdentity` and `QUICK_SHARE_ADMIN_TOKEN_IDENTIFIERS` |
| Convex storage objects | `files` rows, written through `storeUploadedFile` and served by `/api/files/[id]` |

Uploads are content-addressed by SHA-256 and decoded with the importer’s
`inspectFile` helper. Only PNG and JPEG card uploads up to 10 MiB are accepted;
the decoded MIME and dimensions are stored with the bytes. The orphan cleanup
job checks the complete schema-derived file foreign-key set before deleting
rows older than the 24-hour grace period.

Upload admission and default season/rarity setup use transaction-scoped
advisory locks so concurrent requests cannot exceed the documented limits or
create duplicate defaults. Thumbnail jobs read source bytes in a short
transaction, process them outside the transaction, then re-check the attempt
before storing results.

No Convex code or database migration was changed. The catalog service does not
create a write-back path to Convex.
